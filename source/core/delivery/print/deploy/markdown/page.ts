import type { Architecture, Entry } from "../architecture.ts";
import { Theme } from "../reladraw/theme.ts";

/** The categories listed together as one table, and what each is called in its type. */
const VALUE_KIND: Readonly<Record<string, string>> = {
  variables: "variable",
  secrets: "secret",
};
const VALUE_CATEGORIES = Object.keys(VALUE_KIND);

/**
 * The Markdown page about an architecture: its drawing, then what the drawing
 * leaves out: the variables and secrets with every entry that uses them, and
 * the externals the deployment expects to find.
 */
export class Page {
  /** `stem` is the file name the drawings' `.svg` and `.reladraw` share with the page, without extension. */
  write(name: string, stem: string, architecture: Architecture): string {
    return [
      `# ${name} architecture`,
      "",
      `<picture><source media="(prefers-color-scheme: dark)" srcset="${stem}.svg"><img alt="Architecture of ${name}" src="${stem}${Theme.light.suffix}.svg"></picture>`,
      "",
      ...this.valuesSection(architecture),
      ...this.externalsSection(architecture),
    ].join("\n");
  }

  /** One table of the variables and secrets, each typed as which it is, with what uses it; nothing where there are none. */
  private valuesSection(architecture: Architecture): string[] {
    const entries = architecture.entries.filter((entry) =>
      VALUE_CATEGORIES.includes(entry.category)
    );
    if (entries.length === 0) return [];
    const usedBy = this.usersOf(architecture);
    const headers = ["Name", "Type", "Details", "Used by"];
    return [
      "## Variables and secrets",
      "",
      this.row(headers),
      this.row(headers.map(() => "---")),
      ...entries.map((entry) =>
        this.row([
          `\`${entry.name}\``,
          `${VALUE_KIND[entry.category]}: ${entry.type}`,
          this.detailsOf(entry),
          this.listed(usedBy.get(entry.id)),
        ])
      ),
      "",
    ];
  }

  /** The externals as a sentence: what each is, its name there, and why it matters if its entry says. */
  private externalsSection(architecture: Architecture): string[] {
    const externals = architecture.entries.filter((entry) =>
      entry.category === "external"
    );
    if (externals.length === 0) return [];
    return [
      "## External",
      "",
      `The deployment relies on what it doesn't create: ${
        this.sentenceOf(externals.map((entry) => this.externalIn(entry)))
      }.`,
      "",
    ];
  }

  private externalIn(entry: Entry): string {
    const facts = [
      entry.type,
      ...entry.details.map((detail) => `${detail.label}: ${detail.value}`),
    ].join(", ");
    return `\`${entry.name}\` (${facts})${
      entry.description ? `, ${entry.description}` : ""
    }`;
  }

  /** `a`, `a and b`, `a, b and c`. */
  private sentenceOf(parts: readonly string[]): string {
    if (parts.length < 2) return parts.join("");
    return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
  }

  /** For each entry id, the ids of the entries that use it, in order and without repeats. */
  private usersOf(architecture: Architecture): Map<string, string[]> {
    const users = new Map<string, string[]>();
    for (const relation of architecture.relations) {
      const ids = users.get(relation.to) ?? [];
      if (!ids.includes(relation.from)) ids.push(relation.from);
      users.set(relation.to, ids);
    }
    return users;
  }

  private detailsOf(entry: Entry): string {
    return [
      ...(entry.description ? [entry.description] : []),
      ...entry.details.map((detail) => `${detail.label}: ${detail.value}`),
    ].join("<br>");
  }

  private listed(ids: readonly string[] | undefined): string {
    return (ids ?? []).map((id) => `\`${id}\``).join("<br>");
  }

  private row(cells: readonly string[]): string {
    return `| ${
      cells.map((cell) => cell.replaceAll("|", "\\|")).join(" | ")
    } |`;
  }
}
