#!/usr/bin/env python3
import io
import json
import sys
from pathlib import Path
from xml.sax.saxutils import escape
from zipfile import ZIP_DEFLATED, ZipFile


MARKERS = {
    "companyName": "{{companyName}}",
    "businessAddress": "{{businessAddress}}",
    "postcodeCity": "{{postcodeCity}}",
    "vatNumber": "{{vatNumber}}",
}


def main() -> None:
    if len(sys.argv) != 2:
        raise RuntimeError("Gebruik: fill-worldline-refund.py <template.docx>")

    template_path = Path(sys.argv[1])
    values = json.load(sys.stdin)

    with ZipFile(template_path, "r") as source_zip:
        document_xml = source_zip.read("word/document.xml").decode("utf-8")

        for key, marker in MARKERS.items():
            if marker not in document_xml:
                raise RuntimeError(f"Refund-template mist veld {key}.")
            document_xml = document_xml.replace(marker, escape(str(values.get(key, ""))))

        output = io.BytesIO()
        with ZipFile(output, "w", ZIP_DEFLATED) as output_zip:
            for item in source_zip.infolist():
                content = document_xml.encode("utf-8") if item.filename == "word/document.xml" else source_zip.read(item.filename)
                output_zip.writestr(item, content)

    sys.stdout.buffer.write(output.getvalue())


if __name__ == "__main__":
    main()
