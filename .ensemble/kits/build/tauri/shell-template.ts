import { join } from "@std/path";
import { ensureDir } from "@std/fs";
import { BundleIdentifier } from "./bundle-identifier.ts";

/** A 32x32 RGBA square, the one icon Tauri can't compile a Linux shell without. */
const ICON_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAMElEQVR42u3OIQEAAAgDMNJh6R+AHBDjZmJ+Nb2XVAICAgICAgICAgICAgICAunAA54z5IjhIH0kAAAAAElFTkSuQmCC";

const BUILD_RS = `fn main() {
    tauri_build::build()
}
`;

const MAIN_RS =
  `#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("the window opens");
}
`;

const CAPABILITIES = `${
  JSON.stringify(
    {
      $schema: "../gen/schemas/desktop-schema.json",
      identifier: "default",
      windows: ["main"],
      permissions: ["core:default"],
    },
    null,
    2,
  )
}\n`;

/**
 * A hello-world Tauri shell, for an app at `dest` named `name`. It serves its
 * own `public/`, so that it builds with nothing else in the project. To embed
 * another app's build instead, point `build.frontendDist` in its
 * `tauri.conf.json` at `source/artifacts/<app>` and list that app under its
 * `needs:` in `.ensemble/config.yaml`, which a scaffold has no way to do.
 *
 * Its `Cargo.toml` names no workspace: the cargo ecosystem's sync adds that
 * line in a project that declares it, and a project that doesn't can leave the
 * crate on its own.
 */
export class ShellTemplate {
  private readonly title: string;
  private readonly crate: string;

  /** `remote` and `project` are the project's `origin` and its directory's name, for its bundle identifier. */
  constructor(
    private readonly dest: string,
    name: string,
    private readonly remote: string | undefined,
    private readonly project: string,
  ) {
    this.title = name.split("/").at(-1)!;
    this.crate = this.title.replace(/[^a-zA-Z0-9_-]/g, "-");
  }

  async write(): Promise<void> {
    await ensureDir(join(this.dest, "src"));
    await ensureDir(join(this.dest, "public"));
    await ensureDir(join(this.dest, "icons"));
    await ensureDir(join(this.dest, "capabilities"));
    await Deno.writeTextFile(join(this.dest, "Cargo.toml"), this.cargoToml());
    await Deno.writeTextFile(
      join(this.dest, "tauri.conf.json"),
      this.tauriConf(),
    );
    await Deno.writeTextFile(join(this.dest, "build.rs"), BUILD_RS);
    await Deno.writeTextFile(join(this.dest, "src", "main.rs"), MAIN_RS);
    await Deno.writeTextFile(join(this.dest, ".gitignore"), "gen/\n");
    await Deno.writeTextFile(
      join(this.dest, "public", "index.html"),
      this.indexHtml(),
    );
    await Deno.writeFile(
      join(this.dest, "icons", "icon.png"),
      Uint8Array.from(atob(ICON_PNG), (char) => char.charCodeAt(0)),
    );
    await Deno.writeTextFile(
      join(this.dest, "capabilities", "default.json"),
      CAPABILITIES,
    );
  }

  private cargoToml(): string {
    return `[package]
name = "${this.crate}"
version = "0.1.0"
edition = "2021"
publish = false

[build-dependencies]
tauri-build = { version = "2.7.4", features = [] }

[dependencies]
tauri = { version = "2.12.5", features = [] }
`;
  }

  private identifier(): string {
    return BundleIdentifier.for(this.remote, this.project, this.crate)
      .toString();
  }

  private tauriConf(): string {
    return `${
      JSON.stringify(
        {
          $schema: "https://schema.tauri.app/config/2",
          productName: this.title,
          identifier: this.identifier(),
          build: { frontendDist: "public" },
          app: {
            windows: [{ title: this.title, width: 480, height: 320 }],
          },
          bundle: {
            active: true,
            targets: ["deb"],
            icon: ["icons/icon.png"],
          },
        },
        null,
        2,
      )
    }\n`;
  }

  private indexHtml(): string {
    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${this.title}</title>
  </head>
  <body>
    <h1>Hello, world!</h1>
  </body>
</html>
`;
  }
}
