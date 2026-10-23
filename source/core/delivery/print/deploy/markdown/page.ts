import type { Architecture, Entry } from "../architecture.ts";
import { Theme } from "../reladraw/theme.ts";

/**
 * The Markdown page about an architecture: its drawing, then for each
 * category a table of its entries with what they use and what uses them —
 * all of it, including the lines the drawing leaves out.
 */
export class Page {
  /** `stem` is the file name the drawings' `.svg` and `.reladraw` share with the page, without extension. */
  write(name: string, stem: string, architecture: Architecture): string {
    return [
      `# ${name} architecture`,
      "",
      `<picture><source media="(prefers-color-scheme: dark)" srcset="${stem}.svg"><img alt="Architecture of ${name}" src="${stem}${Theme.light.suffix}.svg"></picture>`,
      "",
      `Drawn from \`ci/${name}/delivery.yml\` by \`ens delivery print ${name} --render markdown\`; the drawing's source is [${stem}.reladraw](${stem}.reladraw). A network is an area around the computes attached to it (a compute on two networks sits where they overlap). An arrow goes from what uses to what it uses, and has the color of the compute it leaves. Variables and secrets are not drawn, so the tables below list them and every use of them.`,
      "",
      ...this.categories(architecture).flatMap((category) =>
        this.table(category, architecture)
      ),
    ].join("\n");
  }

  private categories(architecture: Architecture): string[] {
    return [...new Set(architecture.entries.map((entry) => entry.category))];
  }

  private table(category: string, architecture: Architecture): string[] {
    const entries = architecture.entries.filter((entry) =>
      entry.category === category
    );
    const uses = this.relatedBy(architecture, "from", "to");
    const usedBy = this.relatedBy(architecture, "to", "from");
    const hasUses = entries.some((entry) => uses.has(entry.id));
    const hasUsedBy = entries.some((entry) => usedBy.has(entry.id));

    const headers = [
      "Name",
      "Type",
      "Details",
      ...(hasUses ? ["Uses"] : []),
      ...(hasUsedBy ? ["Used by"] : []),
    ];
    return [
      `## ${category}`,
      "",
      this.row(headers),
      this.row(headers.map(() => "---")),
      ...entries.map((entry) =>
        this.row([
          `\`${entry.name}\``,
          entry.type,
          this.detailsOf(entry),
          ...(hasUses ? [this.listed(uses.get(entry.id))] : []),
          ...(hasUsedBy ? [this.listed(usedBy.get(entry.id))] : []),
        ])
      ),
      "",
    ];
  }

  /** For each entry id at `key` of a relation, the ids at `other` of every relation it is in, in order and without repeats. */
  private relatedBy(
    architecture: Architecture,
    key: "from" | "to",
    other: "from" | "to",
  ): Map<string, string[]> {
    const related = new Map<string, string[]>();
    for (const relation of architecture.relations) {
      const ids = related.get(relation[key]) ?? [];
      if (!ids.includes(relation[other])) ids.push(relation[other]);
      related.set(relation[key], ids);
    }
    return related;
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
