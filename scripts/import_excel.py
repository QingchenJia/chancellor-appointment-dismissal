import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from song_chancellors.importer import import_workbook


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("workbook")
    parser.add_argument("--db", default="data/song_chancellors.db")
    parser.add_argument("--rebuild", action="store_true")
    args = parser.parse_args()
    summary = import_workbook(args.workbook, args.db, rebuild=args.rebuild)
    for key, value in summary.items():
        print(f"{key}: {value}")


if __name__ == "__main__":
    main()
