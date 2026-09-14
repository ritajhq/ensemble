/**
 * A render pass's `Artifacts`, assembled by the kit into one target-native
 * document and serialized to bytes ready to write — a compose.yaml's text, a
 * CloudFormation template's text. The core never assembles or serializes
 * this itself (Section 10: "a kit that emits artifacts... is required"); it
 * only knows the result is a named file with some content.
 */
export interface PresentedArtifact {
  readonly filename: string;
  readonly content: string;
}
