package previews.viewers_test

import data.previews.viewers

signed_in(role) := {"auth": {"status": "authenticated", "claims": {"role": role}}}

test_previewer if viewers.allow with input as signed_in("previewer")

test_operator if viewers.allow with input as signed_in("operator")

test_anyone_else if not viewers.allow with input as signed_in("member")

test_anonymous if not viewers.allow with input as {"auth": {"status": "anonymous"}}
