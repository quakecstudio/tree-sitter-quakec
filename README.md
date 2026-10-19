# tree-sitter-quakec

A [tree-sitter](https://tree-sitter.github.io/) grammar for QuakeC, with highlights, locals
and injections queries, for highlighting QuakeC in Zed, Neovim and other tree-sitter editors.
It is part of [QuakeC Studio](https://github.com/quakecstudio/editor) (requirement LANG-8).

## What it parses

Vanilla QuakeC: the language id's `qcc` accepts, as written up in
[`docs/spec/language.md`](https://github.com/quakecstudio/editor/blob/607c38d2b1088e1a9c641cb29ea216a035791670/docs/spec/language.md)
in the editor repository (statement prefix `QC`), from id-Software/Quake-Tools at commit
`c0d1b91c74eb654365ac7755bc837e497caaca73`. `grammar.js` names the statement each rule
implements, and each test in `test/corpus/` is titled with the statement it checks.

- Declarations (QC-11): simple, field and function types, initialisers, function bodies,
  state functions `= [$frame, next] { }` and builtins `= #n`.
- Statements (QC-14) and expressions (QC-15) with qcc's own precedence table, which is not
  C's: `&` and `|` bind like `*`, `=` binds tighter than `&&` and `||`, and the operand of `!`
  reaches down to the comparisons.
- Literals (QC-4 to QC-6), frame macros and `$` commands (QC-8), and the preprocessor
  directives QuakeC Studio defines for vanilla code (QC-9).

The FTEQCC dialect (`for`, `switch`, `int`, arrays, `const`, `#pragma` blocks and the rest)
is not covered yet.

### Where it differs from qcc

A highlighter has to accept a file while it is being typed and does not type-check, so the
grammar accepts some programs qcc rejects:

- Every `$` command keeps the rest of its line, not only the six qcc ignores (QC-8.4), so
  modelgen commands such as `$modelname` (QC-8.8) highlight as commands.
- `a-5` is a subtraction; qcc lexes `-5` as a literal there and fails (QC-4.2).
- A directive other than the seven QC-9 defines is kept as a `preproc_call` line (QC-9.9).
- Nothing semantic is checked: types, redeclarations, unknown names, name length, builtin
  numbers and initialiser types are the compiler's job.

It also rejects two things qcc accepts by accident: a string literal standing for a keyword
(`"if" (a) ...`, QC-3.4) and a name as a global initialiser (`float x = y;`, QC-11.4), as
QuakeC Studio's compiler does (QC-27.3, QC-27.8). Directives stand only where a declaration or
a statement can.

## Queries

- `queries/highlights.scm`: the tree-sitter CLI's standard capture names. A later pattern
  takes precedence over an earlier one for the same node.
- `queries/locals.scm`: one scope per function declaration, since parameters are written in
  the type, outside the body (QC-12.1, QC-13.2); parameters and locals are definitions.
- `queries/injections.scm`: comments as `comment`, and `#define` bodies as QuakeC.

## Development

`src/` is generated from `grammar.js` and committed, as editors build the parser from it.

```bash
TREE_SITTER=$(scripts/install-tree-sitter.sh)   # the pinned CLI, checked by SHA-256, into .tools/
"$TREE_SITTER" generate                          # regenerate src/ after changing grammar.js
"$TREE_SITTER" test                              # test/corpus/ and test/highlight/
TREE_SITTER=$TREE_SITTER scripts/parse-corpus.sh # id's QuakeC 1.01 parses with no ERROR node
```

`scripts/parse-corpus.sh` downloads `qcc/v101qc` from id-Software/Quake-Tools at the pinned
commit into `~/.cache/tree-sitter-quakec/` (or `$XDG_CACHE_HOME`), checks every file against
`test/id-1.01.sha256`, and parses every `.qc` file in it. id's code is never committed here,
and QuakeC 1.06, which has no license, is never fetched. CI runs all four steps.

## License

GPL-3.0-or-later; see [`LICENSE`](LICENSE).
