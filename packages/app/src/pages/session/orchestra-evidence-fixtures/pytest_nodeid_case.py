import pytest


@pytest.mark.parametrize("label", ["hello world", "hello - world"])
def test_label(label):
    assert label == "expected"
