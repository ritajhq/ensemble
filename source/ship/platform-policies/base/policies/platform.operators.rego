package platform.operators

# Who operates the platform — releases, deploys, environments' values and
# secrets: a signed-in user whose roles include "operator". A base policy, so
# nothing published on top can lock them out; changing it means re-packing
# platform-policies.
default allow := false

allow if {
	input.auth.status == "authenticated"
	"operator" in split(input.auth.claims.role, ",")
}
