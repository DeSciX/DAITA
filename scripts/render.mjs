#!/usr/bin/env node
/**
 * Render templates/** -> repo files, substituting the one environment-dependent value.
 *
 * WHY THIS EXISTS
 * The platform origin is the ONLY environment-dependent value in a marketplace bundle.
 * Community ids and app ids are env-invariant (a community IS its on-chain token); repo,
 * marketplace and plugin names are fixed by the naming law; npm package names do not vary.
 * So exactly one variable is templated, and every file carrying the origin is generated.
 *
 * Hand-editing a generated file is drift by definition — CI overwrites it on the next run.
 * Edit the template.
 *
 * FAIL LOUD: a missing or malformed DESCIX_ORIGIN throws. There is no default and no
 * fallback — a wrong origin silently baked into a published plugin is far worse than a
 * failed build, and every user who connects to it must later re-authenticate (connectors
 * are account-level and keyed by URL).
 */

import { readFile, writeFile, mkdir, readdir, stat } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TEMPLATES = join(ROOT, 'templates');

const TOKEN = 'DESCIX_ORIGIN';

function resolveOrigin() {
    const raw = process.env[TOKEN];
    if (!raw || !raw.trim()) {
        throw new Error(
            `${TOKEN} is not set. It is the platform origin every install string points at ` +
            `(e.g. https://dev.descix.net). Set it as an organization-level GitHub Actions ` +
            `variable on the DeSciX org so one edit re-points every marketplace repo.`
        );
    }
    const origin = raw.trim().replace(/\/+$/, '');
    let url;
    try {
        url = new URL(origin);
    } catch {
        throw new Error(`${TOKEN} is not a valid URL: ${JSON.stringify(raw)}`);
    }
    if (url.protocol !== 'https:') {
        throw new Error(`${TOKEN} must be https — got ${url.protocol}//. Refusing to publish a plaintext origin.`);
    }
    if (url.pathname !== '/' || url.search || url.hash) {
        throw new Error(`${TOKEN} must be a bare origin with no path, query or fragment — got ${origin}`);
    }
    return origin;
}

/** Every .tmpl under templates/, recursively. */
async function collect(dir, acc = []) {
    for (const entry of await readdir(dir)) {
        const full = join(dir, entry);
        if ((await stat(full)).isDirectory()) await collect(full, acc);
        else if (entry.endsWith('.tmpl')) acc.push(full);
    }
    return acc;
}

/**
 * listing/description.md is the ONE authored source for this bundle's pitch. It renders into the
 * marketplace manifest, the README, and (via the platform leg of CI) the app and community
 * records. Prose duplicated across those surfaces is how a store card and a plugin card end up
 * disagreeing about what the product is.
 */
async function resolveListingDescription() {
    try {
        const raw = await readFile(join(ROOT, 'listing', 'description.md'), 'utf8');
        const text = raw.trim();
        if (!text) throw new Error('listing/description.md is empty');
        return text;
    } catch (e) {
        if (e.code === 'ENOENT') return null; // optional — only required if a template asks for it
        throw e;
    }
}

const origin = resolveOrigin();
const listingDescription = await resolveListingDescription();
let templates;
try {
    templates = await collect(TEMPLATES);
} catch (e) {
    throw new Error(`No templates/ directory at ${TEMPLATES} — nothing to render. (${e.code || e.message})`);
}
if (templates.length === 0) throw new Error('templates/ contains no .tmpl files — nothing to render.');

const written = [];
for (const tmpl of templates) {
    const body = await readFile(tmpl, 'utf8');

    // Unknown {{PLACEHOLDER}} tokens are a template bug, not something to paper over:
    // an unsubstituted token would ship verbatim into a published install string.
    const KNOWN = new Set([TOKEN, 'LISTING_DESCRIPTION']);
    const unknown = [...body.matchAll(/\{\{\s*([A-Z0-9_]+)\s*\}\}/g)]
        .map((m) => m[1])
        .filter((name) => !KNOWN.has(name));
    if (unknown.length) {
        throw new Error(
            `${relative(ROOT, tmpl)} references unknown placeholder(s): ${[...new Set(unknown)].join(', ')}. ` +
            `Known: ${[...KNOWN].join(', ')}.`
        );
    }

    const out = join(ROOT, relative(TEMPLATES, tmpl).replace(/\.tmpl$/, ''));
    const wantsDescription = /\{\{\s*LISTING_DESCRIPTION\s*\}\}/.test(body);
    if (wantsDescription && listingDescription === null) {
        throw new Error(
            `${relative(ROOT, tmpl)} uses {{LISTING_DESCRIPTION}} but listing/description.md does not exist. ` +
            `That file is the single authored source for this bundle's pitch — create it.`
        );
    }

    let rendered = body.replaceAll(new RegExp(`\\{\\{\\s*${TOKEN}\\s*\\}\\}`, 'g'), origin);
    if (wantsDescription) {
        // Embedding prose in JSON needs escaping, or one apostrophe in the copy breaks the manifest
        // and the marketplace silently fails to sync.
        const value = out.endsWith('.json')
            ? JSON.stringify(listingDescription).slice(1, -1)
            : listingDescription;
        rendered = rendered.replaceAll(/\{\{\s*LISTING_DESCRIPTION\s*\}\}/g, value);
    }

    await mkdir(dirname(out), { recursive: true });
    await writeFile(out, rendered);
    written.push(relative(ROOT, out));
}

console.log(`Rendered ${written.length} file(s) against ${origin}:`);
for (const w of written.sort()) console.log(`  ${w}`);
