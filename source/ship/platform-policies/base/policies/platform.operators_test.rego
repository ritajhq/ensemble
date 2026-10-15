package platform.operators_test

import data.platform.operators

signed_in(role) := {"auth": {"status": "authenticated", "claims": {"role": role}}}

test_operator if operators.allow with input as signed_in("operator")

test_one_of_several_roles if operators.allow with input as signed_in("previewer,operator")

test_previewer_is_not_operator if not operators.allow with input as signed_in("previewer")

test_anonymous if not operators.allow with input as {"auth": {"status": "anonymous"}}
