package platform.anyone

# Anyone at all, signed in or not: only for what verifies its caller by
# itself, such as GitHub's webhooks, each checked with its project's secret.
default allow := true
