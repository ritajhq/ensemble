/**
 * CloudFormation's intrinsic functions, in their long-form (`Fn::X`) object
 * syntax rather than the short YAML tags (`!GetAtt`). Both are valid,
 * equivalent CloudFormation — the long form needs no custom YAML tag
 * support to serialize correctly with a plain YAML stringifier, so that's
 * what this kit emits. Native wiring either way (Section 8): the target
 * resolves these at deploy time, ens never does.
 */

export function ref(logicalId: string): { Ref: string } {
  return { Ref: logicalId };
}

export function getAtt(
  logicalId: string,
  attribute: string,
): { "Fn::GetAtt": [string, string] } {
  return { "Fn::GetAtt": [logicalId, attribute] };
}

export function join(
  parts: readonly unknown[],
): { "Fn::Join": [string, readonly unknown[]] } {
  return { "Fn::Join": ["", parts] };
}

export function select(
  index: number,
  list: unknown,
): { "Fn::Select": [number, unknown] } {
  return { "Fn::Select": [index, list] };
}

export function split(
  delimiter: string,
  value: unknown,
): { "Fn::Split": [string, unknown] } {
  return { "Fn::Split": [delimiter, value] };
}

export function sub(
  template: string,
  variables: Readonly<Record<string, unknown>>,
): { "Fn::Sub": [string, Readonly<Record<string, unknown>>] } {
  return { "Fn::Sub": [template, variables] };
}
