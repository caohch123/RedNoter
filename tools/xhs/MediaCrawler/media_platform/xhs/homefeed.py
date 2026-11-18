"""Homepage candidate normalization. Never log access-token contents."""


def candidate_from_item(item):
    card = item.get("note_card") or {}
    note_id = item.get("id") or card.get("note_id") or card.get("id")
    if not note_id:
        return None
    return {
        "id": note_id,
        "xsec_token": item.get("xsec_token") or card.get("xsec_token") or "",
        "xsec_source": item.get("xsec_source") or card.get("xsec_source") or "pc_feed",
    }


def merge_candidate(previous, incoming):
    # A rendered link can supply the token missing from the recommendation JSON.
    # Keep token and source paired; an empty candidate must not erase a valid one.
    if previous is None or incoming.get("xsec_token"):
        return dict(incoming)
    return dict(previous)
