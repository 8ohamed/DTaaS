"""Tests for persisting GitLab provisioning outcomes (users_gitlab_records.py)."""

import json
from src.pkg import users_gitlab_records
# pylint: disable=protected-access


def test_save_gitlab_tokens_keeps_superseded_entry_rather_than_overwriting(
    tmp_path, monkeypatch, capsys
):
    """If the tokens file already holds a different token for a user, the old
    value is retained under a timestamped key (and a warning printed) instead
    of being silently dropped."""
    monkeypatch.chdir(tmp_path)
    tokens_file = tmp_path / "gitlab_user_tokens.json"
    tokens_file.write_text('{"alice": "glpat-old"}', encoding="utf-8")

    users_gitlab_records._save_gitlab_tokens({"alice": "glpat-new"})

    saved = json.loads(tokens_file.read_text(encoding="utf-8"))
    assert saved["alice"] == "glpat-new"
    superseded = [k for k in saved if k.startswith("alice (superseded ")]
    assert len(superseded) == 1
    assert saved[superseded[0]] == "glpat-old"
    assert "revoked manually" in capsys.readouterr().out
