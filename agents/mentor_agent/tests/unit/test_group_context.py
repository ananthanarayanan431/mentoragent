from __future__ import annotations

from mentor_agent.services.group import group_context


def test_on_the_first_turn_a_mentor_remembers_the_chat_they_were_having() -> None:
    context = group_context(
        "Charlie Munger",
        ambient=[("Warren Buffett", "Index funds."), ("Charlie Munger", "Agreed.")],
    )
    assert "You are in a conversation with the user and Charlie Munger." in context
    assert "Warren Buffett: Index funds.\nCharlie Munger: Agreed." in context


def test_the_second_mentor_reads_what_the_first_just_said() -> None:
    context = group_context("Warren Buffett", just_said="Buy an index fund.")
    assert "Warren Buffett just answered the user: Buy an index fund." in context


def test_the_first_mentor_reads_what_the_other_said_last_time() -> None:
    context = group_context("Charlie Munger", last_said="Avoid fees.")
    assert "Charlie Munger said last: Avoid fees." in context


def test_the_rule_keeps_each_mentor_in_their_own_voice() -> None:
    context = group_context("Charlie Munger")
    assert "own voice" in context
    assert "Never restate what Charlie Munger said" in context
    assert "just answered" not in context
