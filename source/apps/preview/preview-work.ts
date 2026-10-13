import type { Checkouts } from "./checkouts.ts";
import type { Preview } from "./configuration.ts";
import type { Ensemble } from "./ensemble.ts";
import type { Network } from "./network.ts";
import type { PreviewWork } from "./previews.ts";

/** The real work behind a preview: its checkout, the shared network and `ens`. */
export class EnsemblePreviewWork implements PreviewWork {
  constructor(
    private readonly checkouts: Checkouts,
    private readonly network: Network,
    private readonly ensemble: Ensemble,
  ) {}

  async deploy(preview: Preview): Promise<void> {
    await this.network.ensure();
    const checkout = await this.checkouts.update(preview);
    await this.ensemble.deploy(preview, checkout);
  }

  async destroy(preview: Preview): Promise<void> {
    // A branch that was never deployed (or already destroyed) has nothing here.
    if (!await this.checkouts.exists(preview)) return;
    await this.ensemble.destroy(preview, this.checkouts.pathOf(preview));
    await this.checkouts.remove(preview);
  }
}
