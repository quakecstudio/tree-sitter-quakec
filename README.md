# tree-sitter-quakec

A [tree-sitter](https://tree-sitter.github.io/) grammar for QuakeC, with highlights, locals
and injections queries, for highlighting QuakeC in Zed, Neovim and other tree-sitter editors.
It is part of [QuakeC Studio](https://github.com/quakecstudio/editor) (requirements LANG-8 and
LANG-5).

## What it parses

One grammar covers vanilla QuakeC and the FTEQCC dialect. A highlighter cannot know which
compiler a file is written for, so where FTEQCC accepts what id's `qcc` rejects, the grammar
accepts it. The rules follow three specifications in the editor repository at commit
[`9b41dae`](https://github.com/quakecstudio/editor/tree/9b41dae1a22a90cef5b92d50c9d0658d400419f3/docs/spec):

- [`language.md`](https://github.com/quakecstudio/editor/blob/9b41dae1a22a90cef5b92d50c9d0658d400419f3/docs/spec/language.md)
  (prefix `QC`): the language id's `qcc` accepts, from id-Software/Quake-Tools at commit
  `c0d1b91c74eb654365ac7755bc837e497caaca73`.
- [`dialect-fteqcc-rerelease.md`](https://github.com/quakecstudio/editor/blob/9b41dae1a22a90cef5b92d50c9d0658d400419f3/docs/spec/dialect-fteqcc-rerelease.md)
  (prefix `FTE`): the FTEQCC features the Quake rerelease uses.
- [`dialect-fteqcc.md`](https://github.com/quakecstudio/editor/blob/9b41dae1a22a90cef5b92d50c9d0658d400419f3/docs/spec/dialect-fteqcc.md)
  (prefix `FTEF`): the rest of FTEQCC that the FTEQCC corpus mods use.

Both dialect specifications are written from FTEQCC at
fte-team/fteqw@`f937b9d88f71fc4429db5fe56c6a98d922711b2e`. `grammar.js` names the statement each
rule implements, and each test in `test/corpus/` is titled with the statement it checks.

- Vanilla (`declarations.txt`, `statements.txt`, `expressions.txt`, `literals.txt`,
  `frames.txt`, `lexical.txt`, `preprocessor.txt`): declarations (QC-11), statements (QC-14)
  and expressions (QC-15) with qcc's own precedence table, which is not C's: `&` and `|` bind
  like `*`, `=` binds tighter than `&&` and `||`, and the operand of `!` reaches down to the
  comparisons. Literals (QC-4 to QC-6), frame macros and `$` commands (QC-8), and the
  preprocessor directives (QC-9).
- The rerelease subset (`fteqcc-rerelease.txt`): `for`, `switch`, `break` and `continue`, `++`
  and `--`, the compound assignments, `%`, `?:`, vector members, `const`, `var` and `nosave`,
  arrays and `.length`, `typedef struct`, `enum`, `#pragma` (FTE-2 to FTE-16); C-style function
  declarations and builtins by name (FTE-17), parameter lists (FTE-18), the further operators
  and casts (FTE-19), the further literals (FTE-20), and declarations and empty statements in a
  body (FTE-21).
- The full dialect (`fteqcc.txt`): `int` and the C scalar types, typed and hex literals,
  pointers, sized and multidimensional arrays, `struct` and `union`, `typedef`, `enumflags`,
  classes with member functions and access labels, accessors, `__variant` and the remaining
  `#pragma` names (FTEF-2 to FTEF-12).

The operators keep qcc's priorities, extended with FTEQCC's default table (FTE-19.3, and
`qcc_pr_comp.c`, `QCC_PrioritiseOpcodes`): `%`, `^`, `<<` and `>>` bind like `*`, `?:` and
the compound assignments share the priority of `=`, and unary `-`, `+`, `&`, `*` and the casts
take a term.

### Constructs without a spec statement

The corpus uses some FTEQCC constructs that no statement in the three specifications names
yet. The grammar follows FTEQCC's source for them, and each test in
`test/corpus/fteqcc-unspecified.txt` is titled with the FTEQCC function it follows. Adding
their statements to the editor's specifications is plan item P2-35.

- Any expression as a global initialiser (`float IT_ALL = IT_AXE | IT_SHOTGUN;`) and a function
  body inside a function body (`QCC_PR_ParseInitializerType`).
- An expression as a state's frame (`QCC_PR_ParseState`).
- Unnamed parameters, `void` for no parameters, and the `optional`, `inout`, `out` and `in`
  parameter words (`QCC_PR_ParseFunctionType`).
- A function type that returns a function, and a `*` before a later name in a declaration
  (`QCC_PR_ParseDefs`).
- Escapes beyond FTE-20.3 (`\b`, `\x41` and the rest), and adjacent string literals as one
  constant (`QCC_PR_LexString`).
- Character constants `'a'` and two-component vectors `'1 2'` (`QCC_PR_LexVector`).
- Calling a call's result, and reading a field of it (`QCC_PR_RefExpression`).
- A frame reference that stops at `(`, `)`, `&`, `|` and `]` (`QCC_PR_LexMacroName`), and
  `$framesave` (`QCC_PR_LexGrab`).
- The comma operator in a statement, labels and `goto`, `return =`, `if !`, `if not`,
  `until`, `case a .. b` and `?:` with no middle (`QCC_PR_ParseStatement`), and a `for` whose
  `init` mixes expressions and declarations (`QCC_PR_ParseStatement_For`).
- `sizeof` (`QCC_PR_RefTerm`), `[x, y, z]` vectors and `::name` (`QCC_PR_ParseRefValue`), and
  designated initialisers (`QCC_PR_ParseInitializerType`).
- A keyword written with two leading underscores, `__const` (`QCC_PR_CheckKeyword`).
- A `\` before a line break, which `QCC_PR_LexPunctuation` skips, and a directive continued
  past one (`QCC_PR_SkipToEndOfLine`).

### Where it differs from the compilers

A highlighter has to accept a file while it is being typed, does not expand macros and does
not type-check, so the grammar accepts some programs the compilers reject, and reads a few
macro uses differently from them.

- A directive is a line wherever it stands (QC-9.1), so it is an extra here: it may stand
  between any two tokens, between an `if` and its `else` included. Both branches of an `#ifdef`
  are parsed, one after the other.
- A name, or a call, standing alone with no `;` in a body, a class body or at file level is a
  `macro_invocation`: a macro that expands to statements or declarations, such as the
  rerelease's `INHIBIT_COOP` or Nuclide's `PREDICTED_FLOAT(m_flSize)`. It is the reading of last
  resort and is never the body of an `if` or a loop. A macro name followed on the next line by
  `name = value;` still reads as a declaration of `name` with the macro as its type, since
  without the macro's definition the two cannot be told apart.
- The `;` after a definition may be left out, as FTEQCC allows (FTE-17.3, FTE-21.3); a
  definition without one is read only when no other reading fits.
- A name at the start of a statement is a type when a name follows it (FTE-21.1), and
  `(name)` before a term is a parenthesised expression unless only a cast fits. FTEQCC decides
  both from its table of types, which a highlighter does not have.
- `1..5` is one number, as in qcc (QC-4.3); FTEQCC's case range is written `1 .. 5` here.
  `sizeof` takes parentheses.
- Every `$` command keeps the rest of its line, not only the six qcc ignores (QC-8.4), so
  modelgen commands such as `$modelname` (QC-8.8) highlight as commands.
- A directive other than the seven QC-9 defines is kept as a `preproc_call` line (QC-9.9).
- Nothing semantic is checked: types, redeclarations, unknown names, name length, builtin
  numbers and initialiser types are the compiler's job.

Several vanilla errors are therefore accepted: a `;` alone, an empty block, a missing `;` after
a function body, unnamed parameters, unary minus, a leading `.` in a number, and the FTEQCC
operators and statements. The grammar still rejects a string literal standing for a keyword
(`"if" (a) ...`, QC-3.4), as QuakeC Studio's compiler does (QC-27.3).

### Not covered

These files of the FTEQCC corpus mods have an ERROR node, for the construct given. The corpus
check fails if any other file has one, or if one of these parses cleanly
(`test/corpora/not-covered.tsv`).

| File | Construct |
| --- | --- |
| Nuclide `src/shared/game/Actor.qc` | `#ifdef` branches that each open a block, so the braces only balance after preprocessing |
| Nuclide `src/shared/game/Attack.qc` | `#ifdef` branches that each open a block |
| Nuclide `src/shared/physics/pmove_custom.qc` | `#ifdef` branches that each open a block |
| Nuclide `src/gs-entbase/shared/env_fire.qc` | `PREDICTED_FLOAT m_flMaxSize)`, a macro call missing its `(` |
| Nuclide `src/shared/environment/propdata.qc` | `g_propdata[i].flammable = = stof(...)`, a doubled `=` |

## Queries

- `queries/highlights.scm`: the tree-sitter CLI's standard capture names. A later pattern
  takes precedence over an earlier one for the same node.
- `queries/locals.scm`: one scope per function, the whole declaration for a vanilla function
  type, since its parameters are written in the type (QC-12.1, QC-13.2), and the declarator
  for a C-style definition (FTE-17.1). Parameters and locals, with or without `local`
  (FTE-21.1), are definitions; blocks open no scope.
- `queries/injections.scm`: comments as `comment`, and `#define` bodies as QuakeC.

## Development

`src/` is generated from `grammar.js` and committed, as editors build the parser from it.

```bash
TREE_SITTER=$(scripts/install-tree-sitter.sh)   # the pinned CLI, checked by SHA-256, into .tools/
"$TREE_SITTER" generate                          # regenerate src/ after changing grammar.js
"$TREE_SITTER" test                              # test/corpus/ and test/highlight/
TREE_SITTER=$TREE_SITTER scripts/parse-corpus.sh # the corpus check
```

`scripts/parse-corpus.sh` parses every `.qc` and `.qh` file of the codebases in
`test/corpora/codebases.tsv`: id's QuakeC 1.01, the six Quake rerelease codebases
(id-Software/quake-rerelease-qc), and the FTEQCC corpus mods Nuclide, FreeCS, Rad-Therapy
(FreeHL), Copper and Arcane Dimensions. id 1.01 and the rerelease must parse with no ERROR or
MISSING node; a mod file may instead be listed under [Not covered](#not-covered). It fetches
each repository at the commit QuakeC Studio's `corpus/manifest.toml` pins
(`test/corpora/sources.tsv`) into `~/.cache/tree-sitter-quakec/` (or `$XDG_CACHE_HOME`), and
checks every file it reads, license files included, against `test/corpora/<source>.sha256`.
None of that code is committed here, and QuakeC 1.06, which has no license, is never fetched.
CI runs all four steps.

## License

GPL-3.0-or-later; see [`LICENSE`](LICENSE).
