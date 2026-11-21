// Bundles bot/src/index.ts (plus the shared app modules it imports) into one committed Node 22 file.
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

export async function bundle(outfile = join(root, "dist/postmark-verifier.mjs")) {
  await build({
    entryPoints: [join(root, "src/index.ts")],
    outfile,
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node22",
    legalComments: "none",
    minify: true,
    define: { "import.meta.env.VITE_DEPLOYMENT": '"diana"' },
    nodePaths: [join(root, "node_modules")],
    banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
    logLevel: "warning",
  });
  return outfile;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log(`built ${await bundle()}`);
}
