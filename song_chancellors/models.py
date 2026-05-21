from dataclasses import dataclass


@dataclass(frozen=True)
class ParsedPerson:
    canonical_name: str
    raw_name: str
    aliases: str
    source_column: str
