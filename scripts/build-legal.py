#!/usr/bin/env python3
"""Builds the public legal pages: legal/src/*.md -> legal/*.html (GitHub Pages).

Run: pip install markdown && python3 scripts/build-legal.py
Links between pages use the .html names (e.g. [Fees](fees.html)).
"""
import html
import pathlib
import re

import markdown

ROOT = pathlib.Path(__file__).resolve().parent.parent / "legal"
PAGES = [
    ("terms", "Terms of Use"), ("privacy", "Privacy Policy"), ("risks", "Risk disclosures"),
    ("fees", "Fees"), ("third-parties", "Third-party services"), ("sanctions", "Restricted countries"),
    ("testers", "Tester terms"), ("knight-pro", "Knight Pro terms"), ("referrals", "Invite friends terms"),
    ("shield", "Safety checks"), ("contact", "Contact and company"),
]

STYLE = """
:root{--bg:#0b0d10;--fg:#e8eaed;--muted:#9aa0a6;--line:#2a2f36;--accent:#3EE0A1;--card:#14181d}
@media (prefers-color-scheme: light){:root{--bg:#fafafa;--fg:#14181d;--muted:#5f6368;--line:#dadce0;--accent:#077A55;--card:#fff}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.6 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
main{max-width:760px;margin:0 auto;padding:24px 16px 64px}nav{font-size:14px;margin-bottom:24px;display:flex;flex-wrap:wrap;gap:6px 14px}
a{color:var(--accent)}nav a{text-decoration:none}h1{font-size:30px;line-height:1.2;margin:8px 0 12px}h2{font-size:21px;margin-top:32px}
table{border-collapse:collapse;width:100%;font-size:14px;display:block;overflow-x:auto}th,td{border:1px solid var(--line);padding:8px;text-align:left;vertical-align:top}
th{background:var(--card)}footer{margin-top:48px;color:var(--muted);font-size:13px}
"""


def page(slug, title, body):
    nav = " ".join(f'<a href="{s}.html">{html.escape(t)}</a>' for s, t in PAGES)
    return f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{html.escape(title)} · Knight Wallet</title><style>{STYLE}</style></head>
<body><main><nav><a href="index.html"><strong>Knight Wallet legal</strong></a> {nav}</nav>
{body}
<footer>Knight Wallet is software by Dyrection LLC, Cayman Islands. Questions: support@dyrection.com</footer></main></body></html>
"""


def main():
    for slug, title in PAGES:
        text = (ROOT / "src" / f"{slug}.md").read_text(encoding="utf-8")
        body = markdown.markdown(text, extensions=["tables"])
        (ROOT / f"{slug}.html").write_text(page(slug, title, body), encoding="utf-8")
    items = "\n".join(f'<li><a href="{s}.html">{html.escape(t)}</a></li>' for s, t in PAGES)
    index = f"<h1>Knight Wallet legal</h1><p>Knight Wallet is self-custody software. We never hold your keys or your money.</p><ul>{items}</ul>"
    (ROOT / "index.html").write_text(page("index", "Legal", index), encoding="utf-8")


if __name__ == "__main__":
    main()
