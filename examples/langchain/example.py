"""
Tiny demo: load OpenPact tools from the canonical tools.json, record
a knowledge entry, list it back. Real LangChain agents wrap these via
build_langchain_tools(client).
"""
import os

from openpact_tools import OpenPactClient


def main() -> None:
    client = OpenPactClient(base_url=os.environ.get("OPENPACT_URL"))

    created = client.call(
        "record_knowledge",
        topic="wiring",
        content="langchain demo: this entry came from python",
        confidence=0.9,
    )
    print(f"Recorded knowledge entry {created['id']} at {created['timestamp']}.")

    page = client.call("recall_knowledge", topic="wiring", limit=10)
    entries = page["entries"]
    print(f"Recall ({len(entries)} entries; has_more={page['has_more']}):")
    for e in entries:
        print(f"  {e['id']}: {e['payload']['content']}")


if __name__ == "__main__":
    main()
