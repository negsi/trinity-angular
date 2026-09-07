#!/usr/bin/env python3

import os
from pathlib import Path

# Unwichtige Ordner im Angular-Umfeld ignorieren
IGNORE_DIRS = {
    "node_modules", ".git", ".vscode", ".idea", 
    "dist", ".angular", "coverage"
}


def print_project_tree(root_dir: str = ".") -> None:
    root_path = Path(root_dir).resolve()

    for current_root, dirs, files in os.walk(root_path):
        # Ordner filtern, die ignoriert werden sollen
        dirs[:] = [d for d in dirs if d not in IGNORE_DIRS]

        rel_path = Path(current_root).relative_to(root_path)
        indent_level = len(rel_path.parts) if rel_path != Path(".") else 0
        indent = "    " * indent_level

        folder_name = rel_path.name if rel_path != Path(".") else root_path.name
        print(f"{indent}📂 {folder_name}/")

        file_indent = "    " * (indent_level + 1)
        for file in sorted(files):
            print(f"{file_indent}📄 {file}")


if __name__ == "__main__":
    print_project_tree(".")