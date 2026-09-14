import type { MatchedResource } from "./matched-resource.ts";
import type { ProvisioningRequest } from "./provisioning-request.ts";
import type { ResolvedValues } from "./resolved-values.ts";

/** Assembles a matched resource and its negotiated values into the request a `Provisioner` will eventually fulfill. */
export class RequestAssembler {
  assemble(
    resource: MatchedResource,
    values: ResolvedValues,
  ): ProvisioningRequest {
    return {
      category: resource.category,
      name: resource.name,
      type: resource.declaration.type,
      class: resource.declaration.class,
      params: resource.declaration.params,
      values: values.values,
    };
  }
}
