package previews.viewers

# Who may visit previews: a signed-in user whose roles include "previewer" or
# "operator". Previews run branches nobody reviewed yet, so no one else.
default allow := false

allow if {
	input.auth.status == "authenticated"
	some role in split(input.auth.claims.role, ",")
	role in {"operator", "previewer"}
}
