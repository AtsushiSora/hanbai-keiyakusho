import { build } from "esbuild";

await build({
  entryPoints: ["src/contract-auth.js"],
  bundle: true,
  format: "esm",
  outfile: "contract-auth.bundle.js",
  minify: true,
  sourcemap: false,
  target: ["es2020"],
});
