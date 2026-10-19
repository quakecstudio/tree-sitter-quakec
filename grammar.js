// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 QuakeC Studio contributors

/**
 * @file QuakeC: the language id's qcc accepts, and the FTEQCC dialect.
 *
 * The vanilla rules follow docs/spec/language.md in quakecstudio/editor (prefix QC), written
 * from id's qcc at id-Software/Quake-Tools@c0d1b91c74eb654365ac7755bc837e497caaca73. The
 * FTEQCC rules follow docs/spec/dialect-fteqcc-rerelease.md (prefix FTE) and
 * docs/spec/dialect-fteqcc.md (prefix FTEF), written from FTEQCC at
 * fte-team/fteqw@f937b9d88f71fc4429db5fe56c6a98d922711b2e. Comments name the statement each
 * rule implements, or the FTEQCC function its statement quotes; README.md lists where the
 * grammar is more lenient than either compiler.
 *
 * One grammar covers both dialects, as a highlighter cannot know which compiler a file is
 * for: where FTEQCC accepts what qcc rejects, the grammar accepts it.
 */

/// <reference types="tree-sitter-cli/dsl" />
// @ts-check

// QC-15.1, loosest first, extended with FTEQCC's default (non-C) priority classes
// (qcc_pr_comp.c, QCC_PrioritiseOpcodes, the `!flag_cpriority` branch): `&&` and `||` at 7,
// stores and `?:` at 6, comparisons and `!` at 5, `+` and `-` at 4, and `*`, `/`, `%`, the
// bitwise operators and the shifts at 3. Unary `-`, `+`, `&`, `*` and the casts take a term
// (UNARY_PRIORITY), and calls, subscripts and member access bind tightest.
const PREC = {
  comma: -1,
  logical: 1,
  assign: 2,
  not: 3,
  compare: 4,
  add: 5,
  multiply: 6,
  unary: 7,
  postfix: 8,
};

// Whitespace on one line: every byte from 0x01 to 0x20 except LF (QC-2.1).
const BLANKS = /[\x01-\x09\x0b-\x20]+/;

// FTEF-2: the C scalar type words FTEQCC's QCC_PR_ParseType reads.
const SIZE_WORDS = ['signed', 'unsigned', 'long', 'short'];

// The storage classes and modifiers QCC_PR_ParseDefs reads before a type (qcc_pr_comp.c,
// the modifier loop at the top of QCC_PR_ParseDefs), with the class member qualifiers of
// QCC_PR_ParseEntClass (FTEF-9.2, FTEF-9.3). `local` (QC-11.10) has its own statement.
const QUALIFIERS = [
  'const', 'var', 'nosave', // FTE-10, FTE-11, FTE-12
  'typedef', 'extern', 'auto', 'register', 'static', 'shared', 'nonstatic', 'unused',
  'noref', 'used', 'strip', 'ignore', 'inline', 'wrap', 'weak', 'accumulate', 'volatile',
  'virtual', 'nonvirtual', // FTEF-9.2
];

module.exports = grammar({
  name: 'quakec',

  word: $ => $.identifier,

  extras: $ => [
    // QC-2.1 and QC-1.3: bytes up to 0x20, and every non-ASCII character outside a string.
    /[\x01-\x20]/,
    /[^\x00-\x7f]/,
    $.comment,
    // QC-9.1: a directive is a line whose first non-blank byte is `#`, wherever it stands,
    // since the preprocessor runs before the parser. So it is an extra here and may stand
    // between any two tokens: between an `if` and its `else`, among enumerators, initialisers
    // and members.
    $.preproc_include,
    $.preproc_define,
    $.preproc_undef,
    $.preproc_ifdef,
    $.preproc_else,
    $.preproc_endif,
    $.preproc_call,
    // A `\` before a line break is skipped (qcc_pr_lex.c, QCC_PR_LexPunctuation).
    /\\\r?\n/,
  ],

  conflicts: $ => [
    [$._type_identifier, $.macro_invocation, $._primary_expression],
    [$._type_identifier, $.macro_invocation],
    [$.macro_invocation, $._primary_expression],
    [$.initializer_list, $._expressions],
    // A name at the start of a statement is a type or an expression until what follows it
    // decides (FTEQCC asks its type table, QCC_TypeForName; a highlighter cannot).
    [$._type_identifier, $._primary_expression],
    [$.state, $.vector_expression],
    [$.initializer_list, $.block],
    [$.function_body, $.initializer_list],
    [$.sized_type],
    [$._type, $._tag_type],
  ],

  rules: {
    // QC-11.1: a file is a sequence of declarations; QC-8 adds `$` commands. FTE-17.3: a `;`
    // before a definition is skipped.
    source_file: $ => repeat($._top_level_item),

    _top_level_item: $ => choice(
      $.declaration,
      alias($._constructor_definition, $.declaration),
      $.frame_definition,
      $.model_command,
      $.empty_declaration,
      $.macro_invocation,
    ),

    empty_declaration: _ => prec.dynamic(-1, ';'),

    // QC-2.2, QC-2.3: `//` to the end of the line; `/*` to the first `*/` found from the `*`
    // of the `/*`, so `/*/` is a whole comment.
    comment: _ => token(choice(
      seq('//', /[^\n]*/),
      /\/\*(\/|([^*\/][^*]*)?\*+([^\/*][^*]*\*+)*\/)/,
    )),

    // QC-3.1. No name is reserved (QC-3.2): a keyword is one only where the parser expects
    // it, which tree-sitter's context-aware lexing gives for free.
    identifier: _ => /[A-Za-z_][A-Za-z0-9_]*/,

    // QC-10 Types, and FTEF-2 to FTEF-11.

    _type: $ => choice(
      $.simple_type,
      $.sized_type,
      $.field_type,
      $.function_type,
      $.pointer_type,
      $._type_identifier,
      $.struct_specifier,
      $.enum_specifier,
      $.class_specifier,
      $.accessor_specifier,
    ),

    // QC-10.1; FTEF-2.1, FTEF-2.3 (`int`, `integer`, `double`, `_Bool`, `char`); FTEF-11.1
    // (`__variant`).
    simple_type: _ => choice(
      'void', 'float', 'vector', 'string', 'entity',
      'int', 'integer', 'double', 'char', '_Bool', '__variant',
    ),

    // FTEF-2.2, FTEF-2.4: `unsigned`, `signed`, `long` and `short` in any order C allows,
    // with or without the word they qualify.
    sized_type: $ => seq(
      repeat1(choice(...SIZE_WORDS)),
      optional(choice('int', 'integer', 'char', 'double', 'float')),
    ),

    // FTEF-7.2: a typedef, class, struct, enum or accessor name used as a type.
    _type_identifier: $ => alias($.identifier, $.type_identifier),

    // QC-10.2: `.T` for any type T, including `..float`.
    field_type: $ => prec.right(seq('.', field('type', $._type))),

    // QC-10.3, QC-10.5: a return type and a parameter list. FTEQCC reads the list after any
    // type (QCC_PR_ParseDefs, the `while(QCC_PR_CheckToken("("))` loop), so the return type
    // may be any type, a function type included.
    function_type: $ => prec.left(seq(
      field('return_type', $._type),
      field('parameters', $.parameter_list),
    )),

    // FTEF-4.1: `T *`, one `*` per level.
    pointer_type: $ => prec.left(seq(field('type', $._type), '*')),

    // QC-10.3, QC-10.4: named parameters, none, or `...` alone. FTE-18.1: `...` may end a list
    // after named parameters; FTE-18.2: a parameter may have a default; FTE-18.3: its type may
    // be one the program defined. FTEQCC also takes unnamed parameters, `void` for none and a
    // C++ `&` (qcc_pr_lex.c, QCC_PR_ParseFunctionType).
    parameter_list: $ => seq(
      '(',
      optional(choice(
        '...',
        seq(commaSep1($.parameter), optional(seq(',', '...'))),
      )),
      ')',
    ),

    parameter: $ => seq(
      repeat($.parameter_qualifier),
      field('type', $._type),
      optional('&'),
      optional(seq(
        field('name', $.identifier),
        repeat($.array_dimension),
      )),
      optional(seq('=', field('default', $._expression))),
    ),

    // qcc_pr_lex.c, QCC_PR_ParseFunctionType: `optional` and the `inout`, `out` and `in`
    // direction words, with `const` (FTEF-2.5).
    parameter_qualifier: _ => choice(...keywords(['optional', 'inout', 'out', 'in', 'const'])),

    // FTEF-6, FTE-14: `struct` or `union`, an optional name, an optional parent and the
    // members; or a name alone, a forward declaration or a use.
    struct_specifier: $ => prec.right(seq(
      choice('struct', 'union'),
      optional(field('name', $.identifier)),
      optional(seq(':', field('parent', $.identifier))),
      optional(field('body', $.member_list)),
    )),

    member_list: $ => seq('{', repeat($._member), '}'),

    // FTE-15, FTEF-8: `enum` or `enumflags`, optionally `class`, a name (FTE-15.4) and an
    // element type.
    enum_specifier: $ => prec.right(seq(
      choice('enum', 'enumflags'),
      optional('class'),
      optional(field('name', $.identifier)),
      optional(seq(':', field('base', $._type))),
      optional(field('body', $.enumerator_list)),
    )),

    enumerator_list: $ => seq(
      '{',
      optional(seq(commaSep1($.enumerator), optional(','))),
      '}',
    ),

    enumerator: $ => seq(
      field('name', $.identifier),
      optional(seq('=', field('value', $._expression))),
    ),

    // FTEF-9.1: `class Name`, an optional parent and the members.
    class_specifier: $ => prec.right(seq(
      'class',
      field('name', $.identifier),
      optional(seq(':', field('parent', $.identifier))),
      optional(field('body', $.member_list)),
    )),

    // FTEF-10.1: `accessor Name : Base` and its get and set members.
    accessor_specifier: $ => prec.right(seq(
      'accessor',
      field('name', $.identifier),
      optional(seq(':', field('base', $._type))),
      optional(field('body', $.member_list)),
    )),

    // FTEF-9.2, FTEF-9.3, FTEF-10.2, FTEF-10.3: a member of a class, struct or accessor.
    _member: $ => choice(
      $.declaration,
      $.access_specifier,
      $.accessor_member,
      $.empty_declaration,
      $.macro_invocation,
    ),

    // FTEF-9.3: `public:`, `private:` and `protected:`; FTEF-9.2: `virtual:` and
    // `nonvirtual:` set the default for the members after them.
    access_specifier: _ => seq(
      choice('public', 'private', 'protected', 'virtual', 'nonvirtual'),
      ':',
    ),

    // FTEF-10.2: `get` or `set`, optionally `inline`, a type, a name and its function.
    accessor_member: $ => prec.right(seq(
      optional('inline'),
      choice('get', 'set'),
      optional(choice('&', '*')),
      field('type', $._type),
      optional(field('name', $.identifier)),
      optional(seq(
        '[',
        field('index', $._type),
        optional(field('index_name', $.identifier)),
        ']',
      )),
      optional(choice(
        seq('=', choice(field('value', $._expression), field('body', $.function_body))),
        field('body', $.function_body),
      )),
      optional(';'),
    )),

    // QC-11 Declarations.

    // QC-11.1: a type, names separated by `,`, then `;`. FTEQCC reads storage classes and
    // modifiers first (FTE-10, FTE-11, FTE-12), and the `;` after a definition is optional
    // (FTE-17.3, FTE-21.3). A struct, union, enum, class or accessor may stand with no name
    // after it (QCC_PR_ParseDefs returns at a `;` straight after the type). FTE-21.1: a
    // declaration may stand among the statements of a body.
    declaration: $ => prec.right(seq(
      repeat($._modifier),
      choice(
        seq(field('type', $._type), $._declarators),
        field('type', $._tag_type),
      ),
      endOfDefinition(),
    )),

    // FTEF-9.4: a constructor defined outside its class, `Class::Class(...) {...}`, has no
    // type (QCC_PR_ParseDefs: "no type specified for %s::%s. this is only allowed for
    // constructors").
    _constructor_definition: $ => prec.right(seq(
      field('declarator', alias($._constructor_declarator, $.declarator)),
      optional(';'),
    )),

    _constructor_declarator: $ => seq(
      field('name', alias($._qualified_identifier, $.scoped_identifier)),
      field('parameters', $.parameter_list),
      field('body', $.function_body),
    ),

    _qualified_identifier: $ => prec(1, seq(
      field('scope', $.identifier),
      '::',
      field('name', $.identifier),
    )),

    // QCC_PR_ParseDefs reads `*`s before each name (`while (QCC_PR_CheckToken ("*"))`), so
    // `T a, *b` declares a pointer `b`. Before the first name the `*` is read as part of
    // the type (FTEF-4.1).
    _declarators: $ => seq(
      field('declarator', $.declarator),
      repeat(seq(',', field('declarator', choice($.declarator, $.pointer_declarator)))),
    ),

    pointer_declarator: $ => seq(
      '*',
      field('declarator', choice($.declarator, $.pointer_declarator)),
    ),

    _tag_type: $ => choice(
      $.struct_specifier,
      $.enum_specifier,
      $.class_specifier,
      $.accessor_specifier,
    ),

    _modifier: $ => choice($.storage_qualifier, $.deprecated_attribute),

    storage_qualifier: _ => choice(...keywords(QUALIFIERS)),

    // QCC_PR_ParseDefs: `deprecated`, with an optional reason.
    deprecated_attribute: $ => seq(
      choice(...keywords(['deprecated'])),
      optional(seq('(', optional($.string_literal), ')')),
    ),

    // QC-11.10: `local`, then the declaration grammar. FTEQCC reads the rest with
    // QCC_PR_ParseDefs (QCC_PR_ParseStatement, the `local` case), so an initialiser is any
    // expression (FTE-21.1) and a local may be a field or a function (FTE-21.2).
    local_declaration: $ => prec.right(seq(
      'local',
      repeat($._modifier),
      field('type', $._type),
      $._declarators,
      endOfDefinition(),
    )),

    // QC-11.2, QC-11.3, QC-13.1: a name, optionally `Class::name` (FTEF-9.4), array
    // dimensions (FTE-13, FTEF-5), a C-style parameter list (FTE-17.1), then an initialiser
    // after `=`, or a function body or state body with or without `=` (FTE-17.2), or a
    // bitfield width (FTEF-6.4). An initialiser is any expression
    // (QCC_PR_ParseInitializerType reads QCC_PR_Expression), and a function body may stand
    // inside another (QCC_PR_ParseInitializerType, the `pr_scope` case).
    declarator: $ => prec.right(seq(
      field('name', choice($.identifier, $.scoped_identifier)),
      repeat($.array_dimension),
      optional(field('parameters', $.parameter_list)),
      optional(choice(
        seq('=', choice(
          field('value', choice($._expression, $.initializer_list, $.builtin)),
          field('body', $.function_body),
          seq(field('state', $.state), field('body', $.function_body)),
        )),
        field('body', $.function_body),
        seq(field('state', $.state), field('body', $.function_body)),
        seq(':', field('bits', $._expression)),
      )),
    )),

    // FTE-13.1, FTEF-5.1, FTEF-5.2: `[N]` or `[]`.
    array_dimension: $ => seq('[', optional(field('size', $._expression)), ']'),

    // FTE-13.1, FTE-14.3, FTEF-6.5: braces around values, nested for arrays of structs, with
    // FTEQCC's designated `.member = value` form (QCC_PR_ParseInitializerType).
    initializer_list: $ => prec.dynamic(-1, seq(
      '{',
      optional(seq(
        commaSep1(choice($._expression, $.initializer_list, $.designated_initializer)),
        optional(','),
      )),
      '}',
    )),

    designated_initializer: $ => seq(
      '.',
      field('member', $.identifier),
      '=',
      field('value', $._expression),
    ),

    // QC-13.3: `#n`, the engine builtin number n. FTE-17.4: `#n:name` names the engine's
    // builtin; FTEQCC also takes a string for the number (QCC_PR_ParseInitializerType).
    builtin: $ => seq(
      '#',
      field('number', choice($.float_literal, $.string_literal)),
      optional(seq(':', field('name', $.identifier))),
    ),

    // QC-13.6: `[frame, next]`. FTEQCC reads both as expressions (QCC_PR_ParseState).
    state: $ => seq(
      '[',
      field('frame', $._expression),
      ',',
      field('next', $._expression),
      ']',
    ),

    // QC-13.1: an empty body is allowed.
    function_body: $ => seq('{', repeat($._block_item), '}'),

    // QC-14 Statements, and FTE-2 to FTE-4, FTE-21.

    _statement: $ => choice(
      $.block,
      $.declaration,
      $.local_declaration,
      $.return_statement,
      $.if_statement,
      $.while_statement,
      $.do_statement,
      $.for_statement,
      $.switch_statement,
      $.case_statement,
      $.break_statement,
      $.continue_statement,
      $.goto_statement,
      $.labeled_statement,
      $.expression_statement,
      $.empty_statement,
    ),

    // A statement in a block or function body; a macro invocation stands only here, never
    // as the body of an `if` or a loop.
    _block_item: $ => choice($._statement, $.macro_invocation),

    // A name, or a call, with no `;` after it: a macro this grammar cannot expand, such as
    // the rerelease's `INHIBIT_COOP` (QCC_PR_Lex expands a #define'd name before parsing).
    // It is the reading of last resort (README.md, Leniency).
    macro_invocation: $ => prec.dynamic(-10, seq(
      field('name', $.identifier),
      optional(field('arguments', $.argument_list)),
    )),

    // QC-14.2; FTE-21.4: a block may be empty.
    block: $ => seq('{', repeat($._block_item), '}'),

    // FTE-21.5: a `;` alone is an empty statement.
    empty_statement: _ => prec.dynamic(-1, ';'),

    // QC-14.3. FTEQCC also takes `return = value;` (QCC_PR_ParseStatement, the `return`
    // case).
    return_statement: $ => seq(
      'return',
      optional('='),
      optional(field('value', $._expressions)),
      ';',
    ),

    // QC-14.4, QC-14.7: `else` binds to the nearest `if`. FTEQCC also takes `if !(...)` and
    // `if not(...)` (QCC_PR_ParseStatement, the `if` case).
    if_statement: $ => prec.right(seq(
      'if',
      optional(choice('!', 'not')),
      '(',
      field('condition', $._expressions),
      ')',
      field('consequence', $._statement),
      optional(seq('else', field('alternative', $._statement))),
    )),

    // QC-14.5; FTEQCC's `until` is `while` negated.
    while_statement: $ => seq(
      choice('while', 'until'),
      '(',
      field('condition', $._expressions),
      ')',
      field('body', $._statement),
    ),

    // QC-14.6: the `;` is required.
    do_statement: $ => seq(
      'do',
      field('body', $._statement),
      choice('while', 'until'),
      '(',
      field('condition', $._expressions),
      ')',
      ';',
    ),

    // FTE-2.1, FTE-2.2: `for (init; cond; step) body`, any part may be empty, and `init` may
    // declare locals (QCC_PR_ParseStatement_For).
    for_statement: $ => seq(
      'for',
      '(',
      optional(commaSep1(field('initializer', choice(
        $._expression,
        alias($._for_declaration, $.declaration),
      )))),
      ';',
      optional(field('condition', $._expressions)),
      ';',
      optional(field('update', $._expressions)),
      ')',
      field('body', $._statement),
    ),

    // QCC_PR_ParseStatement_For reads each comma-separated part of `init` as a declaration
    // when it starts with a type, and as an expression otherwise.
    _for_declaration: $ => seq(
      field('type', $._type),
      field('declarator', $.declarator),
    ),

    // FTE-3.1: `switch (expr)` and its body.
    switch_statement: $ => seq(
      'switch',
      '(',
      field('condition', $._expressions),
      ')',
      field('body', $._statement),
    ),

    // FTE-3.1, FTE-3.3: `case value:` and `default:` labels, FTEQCC's `case a..b:` range
    // included (QCC_PR_ParseStatement, the `case` case).
    case_statement: $ => prec.right(seq(
      choice(
        seq(
          'case',
          field('value', $._expression),
          optional(seq('..', field('end', $._expression))),
        ),
        'default',
      ),
      ':',
    )),

    // FTE-4.1
    break_statement: _ => seq('break', ';'),

    continue_statement: _ => seq('continue', ';'),

    // QCC_PR_ParseStatement: `goto label;` and the label `name:`.
    goto_statement: $ => seq('goto', field('label', $.identifier), ';'),

    labeled_statement: $ => seq(field('label', $.identifier), ':'),

    // QC-14.9; FTEQCC reads a statement's expression at TOP_PRIORITY with commas allowed.
    expression_statement: $ => seq($._expressions, ';'),

    // QC-15 Expressions, and FTE-5 to FTE-9, FTE-13, FTE-19.

    // QCC_PR_ParseStatement reads statement expressions with the comma operator allowed;
    // initialisers and arguments disallow it (EXPR_DISALLOW_COMMA).
    _expressions: $ => choice($._expression, $.comma_expression),

    comma_expression: $ => prec.left(PREC.comma, seq(
      field('left', $._expressions),
      ',',
      field('right', $._expression),
    )),

    _expression: $ => choice(
      $.assignment_expression,
      $.conditional_expression,
      $.binary_expression,
      $.not_expression,
      $.unary_expression,
      $.update_expression,
      $.cast_expression,
      $.sizeof_expression,
      $.field_expression,
      $.subscript_expression,
      $.call_expression,
      $._primary_expression,
    ),

    // QC-15.7: the terms other than `!`.
    _primary_expression: $ => choice(
      $.identifier,
      $.scoped_identifier,
      $.float_literal,
      $.vector_literal,
      $.char_literal,
      $.string_literal,
      $.concatenated_string,
      $.frame_reference,
      $.parenthesized_expression,
      $.vector_expression,
    ),

    parenthesized_expression: $ => seq('(', $._expressions, ')'),

    // FTEF-9.2, FTEF-9.4: `Class::member`, `super::member` and `::name`
    // (QCC_PR_ParseRefValue).
    scoped_identifier: $ => prec.left(1, seq(
      optional(field('scope', $.identifier)),
      '::',
      field('name', $.identifier),
    )),

    // QCC_PR_ParseRefValue: `[x, y, z]` builds a vector from expressions; `y` and `z` may be
    // left out.
    vector_expression: $ => seq('[', commaSep1($._expression), ']'),

    // QC-15.8: field access chains, `e.en.hp` is `(e.en).hp`. FTEQCC applies `.` and `->`
    // to any term, a call included (QCC_PR_ParseRefArrayPointer); FTE-9.1 vector members
    // and FTE-13.3 `.length` are field expressions too.
    field_expression: $ => prec.left(PREC.postfix, seq(
      field('object', $._expression),
      choice('.', '->'),
      field('field', $._primary_expression),
    )),

    // FTE-13.2: `name[i]`.
    subscript_expression: $ => prec.left(PREC.postfix, seq(
      field('object', $._expression),
      '[',
      field('index', $._expressions),
      ']',
    )),

    // QC-15.8, QC-18.7: the callee is a term or a field access. FTEQCC calls the result of
    // any postfix expression (QCC_PR_RefExpression, FUNC_PRIORITY).
    call_expression: $ => prec(PREC.postfix, seq(
      field('function', $._expression),
      field('arguments', $.argument_list),
    )),

    argument_list: $ => seq('(', commaSep($._expression), ')'),

    // QC-15.6: `!`'s operand reaches down to the comparisons. FTE-19.4: `~` takes the same
    // operand.
    not_expression: $ => prec(PREC.not, seq(
      field('operator', choice('!', '~')),
      field('operand', $._expression),
    )),

    // FTE-19.4: unary `-` and `+` take a term; so do `&` (FTEF-4.2) and `*` (FTEF-4.4)
    // (QCC_PR_RefTerm, UNARY_PRIORITY).
    unary_expression: $ => prec(PREC.unary, seq(
      field('operator', choice('-', '+', '&', '*')),
      field('operand', $._expression),
    )),

    // FTE-5.1, FTE-5.2: postfix and prefix `++` and `--`.
    update_expression: $ => {
      const op = choice('++', '--');
      return choice(
        prec.left(PREC.postfix, seq(field('operand', $._expression), field('operator', op))),
        prec(PREC.unary, seq(field('operator', op), field('operand', $._expression))),
      );
    },

    // FTE-19.6, FTEF-4.1: `(T)expr` casts a term. QCC_PR_RefTerm also reads `(T){...}` as a
    // value of T.
    cast_expression: $ => prec.dynamic(-1, prec(PREC.unary, seq(
      '(',
      field('type', $._type),
      ')',
      field('value', choice($._expression, $.initializer_list)),
    ))),

    // QCC_PR_RefTerm: `sizeof(T)` and `sizeof(expr)`. FTEQCC also takes `sizeof expr`
    // with no parentheses, which this grammar does not (README.md).
    sizeof_expression: $ => seq(
      'sizeof',
      '(',
      choice(field('type', $._type), field('value', $._expressions)),
      ')',
    ),

    // QC-15.3, QC-17.1: `=` is right-associative and binds tighter than `&&` and `||`.
    // FTE-6.1, FTE-19.1, FTE-19.3: the compound assignments share its priority.
    assignment_expression: $ => prec.right(PREC.assign, seq(
      field('left', $._expression),
      field('operator', choice(
        '=', '+=', '-=', '*=', '/=', '%=', '|=', '&=', '&~=', '^=', '<<=', '>>=',
        // FTE-19.2: `(+)` is `|=` and `(-)` is `&~=`.
        '(+)', '(-)',
      )),
      field('right', $._expression),
    )),

    // FTE-8.1: `cond ? a : b`, at the stores' priority (PC_TERNARY and PC_STORE are both 6
    // in FTEQCC's default table), right-associative; FTEQCC also takes `a ?: b`.
    conditional_expression: $ => prec.right(PREC.assign, seq(
      field('condition', $._expression),
      '?',
      optional(field('consequence', $._expressions)),
      ':',
      field('alternative', $._expression),
    )),

    // QC-15.1, QC-15.2, QC-15.4, QC-15.5: all binary operators associate left. FTE-7.1 adds
    // `%`, and FTE-19.3 `^`, `<<` and `>>`, beside `*`; FTEQCC's opcode table also has `><`
    // in PC_MULDIV and `<=>` in PC_EQUALITY (qcc_pr_comp.c, pr_opcodes). FTE-19.5: `a -1` is a subtraction, as the lexer
    // reads `-1` as a number only where a term can start.
    binary_expression: $ => choice(...[
      [PREC.multiply, choice('*', '/', '%', '&', '|', '^', '<<', '>>', '><')],
      [PREC.add, choice('+', '-')],
      [PREC.compare, choice('==', '!=', '<=', '>=', '<', '>', '<=>')],
      [PREC.logical, choice('&&', '||')],
    ].map(([precedence, operator]) => prec.left(/** @type {number} */ (precedence), seq(
      field('left', $._expression),
      // @ts-ignore
      field('operator', operator),
      field('right', $._expression),
    )))),

    // QC-4 to QC-6 Literals.

    // QC-4.1, QC-4.3: a digit, or `-` and a digit, then digits and dots. FTE-20.1: a leading
    // `.`; FTE-20.2, FTEF-3.1: type suffixes; FTEF-3.2: `0x` hex. No exponent (QC-4.4).
    float_literal: _ => token(seq(
      optional('-'),
      choice(
        /0[xX][0-9a-fA-F]*/,
        /[0-9][0-9.]*/,
        /\.[0-9]+/,
      ),
      optional(/[fFdDiIuUlL]+/),
    )),

    // QC-5.1 to QC-5.3: three components between single quotes, with whitespace and comments
    // between them. A component's first byte is taken whatever it is. FTEQCC also takes two
    // components, with a warning "2d vector" (qcc_pr_lex.c, QCC_PR_LexVector).
    vector_literal: $ => seq(
      '\'',
      field('x', $._vector_component),
      field('y', $._vector_component),
      optional(field('z', $._vector_component)),
      '\'',
    ),

    _vector_component: $ => alias(token(/[^\x00-\x20'][0-9.]*/), $.float_literal),

    // QCC_PR_LexVector: one character, or one escape, between single quotes is a character
    // constant.
    char_literal: _ => token(seq('\'', choice(/[^\\'\n]/, /\\[^\n]/, /\\x[0-9a-fA-F]+/), '\'')),

    // QC-6.1 to QC-6.3: no line break inside. FTE-20.4 adds C's one-byte escapes; FTEQCC
    // also has its markup escapes, `\x` and `\u` (qcc_pr_lex.c, QCC_PR_LexString and
    // QCC_PR_LexEscapedCodepoint), so any escape is taken.
    string_literal: $ => seq(
      '"',
      repeat(choice(
        alias(token.immediate(prec(1, /[^"\\\n]+/)), $.string_content),
        $.escape_sequence,
      )),
      token.immediate('"'),
    ),

    escape_sequence: _ => token.immediate(/\\([^\r\n]|\r?\n)/),

    // QCC_PR_LexString keeps reading while the next token is another string, so adjacent
    // strings are one constant.
    concatenated_string: $ => prec.right(1, seq($.string_literal, repeat1($.string_literal))),

    // QC-8 Frame macros and `$` commands.

    // QC-8.1, QC-8.5, QC-8.6: the word runs to the next whitespace, `,` or `;`. FTEQCC's
    // QCC_PR_LexMacroName also stops at `&`, `|`, `(`, `)` and `]`.
    frame_reference: _ => token(seq('$', /[ \t]*/, /[^\x00-\x20,;&|()\]]+/)),

    // QC-8.2: `$frame` and the names after it on the same line, split at whitespace.
    frame_definition: $ => seq(
      '$',
      choice('frame', 'framesave'),
      repeat(choice(
        token.immediate(BLANKS),
        alias(token.immediate(/[^\x00-\x20,;]+/), $.frame_name),
      )),
    ),

    // QC-8.4, QC-8.8: every other `$` command, with the rest of its line. qcc ignores `$cd`,
    // `$origin`, `$base`, `$flags`, `$scale` and `$skin` and rejects the rest; this grammar
    // accepts them all (README.md, Leniency).
    model_command: $ => seq(
      '$',
      field('name', $.identifier),
      optional(seq(
        token.immediate(BLANKS),
        optional(field('arguments', alias(
          token.immediate(/[^\x00-\x20][^\n]*/),
          $.command_arguments,
        ))),
      )),
    ),

    // QC-9 Preprocessor: each directive is one line.

    // QC-9.2
    preproc_include: $ => seq(directive('include'), field('path', $.string_literal)),

    // QC-9.3: object-like, or function-like with `(` directly after the name.
    preproc_define: $ => seq(
      directive('define'),
      field('name', $.identifier),
      optional(field('parameters', $.preproc_params)),
      optional(field('value', $.preproc_arg)),
      token.immediate(/\r?\n/),
    ),

    preproc_params: $ => seq(
      token.immediate('('),
      commaSep(choice($.identifier, '...')),
      ')',
    ),

    // QC-9.5
    preproc_undef: $ => seq(directive('undef'), field('name', $.identifier)),

    // QC-9.6
    preproc_ifdef: $ => seq(
      choice(directive('ifdef'), directive('ifndef')),
      field('name', $.identifier),
    ),

    preproc_else: _ => directive('else'),

    preproc_endif: _ => directive('endif'),

    // QC-9.9: any other directive is an error to the compiler; kept as a line here so that
    // FTEQCC's `#pragma` (FTE-16, FTEF-12) and `#if` do not break the rest of the file.
    preproc_call: $ => seq(
      field('directive', $.preproc_directive),
      optional(field('argument', $.preproc_arg)),
      token.immediate(/\r?\n/),
    ),

    preproc_directive: _ => /#[ \t]*[A-Za-z_][A-Za-z0-9_]*/,

    // A directive's text runs to the end of the line, and past a line break escaped with `\`
    // (qcc_pr_lex.c, QCC_PR_SkipToEndOfLine), stopping before a comment.
    preproc_arg: _ => token(prec(-1, /\S([^\/\n\\]|\/[^*\/\n]|\\\r?\n|\\[^\r\n])*/)),
  },
});

/**
 * The `;` that ends a definition. FTEQCC makes it optional (QCC_PR_ParseDefs), but a
 * definition without it is the reading of last resort, below a macro invocation, so that a
 * macro call on its own line does not read as a function type with the next word as its name.
 *
 * @returns {ChoiceRule}
 */
function endOfDefinition() {
  return choice(';', prec.dynamic(-20, blank()));
}

/**
 * FTEQCC's keywords and their `__` forms: QCC_PR_CheckKeyword (qcc_pr_lex.c) accepts any
 * keyword with two leading underscores, even where the plain word is disabled.
 *
 * @param {string[]} words
 * @returns {string[]}
 */
function keywords(words) {
  return words.flatMap(word => [word, '__' + word]);
}

/**
 * A directive keyword: `#`, optional blanks, then the name (QC-9.1).
 *
 * @param {string} name
 * @returns {AliasRule}
 */
function directive(name) {
  return alias(new RegExp('#[ \t]*' + name), '#' + name);
}

/**
 * One or more of a rule, separated by commas.
 *
 * @param {RuleOrLiteral} rule
 * @returns {SeqRule}
 */
function commaSep1(rule) {
  return seq(rule, repeat(seq(',', rule)));
}

/**
 * Zero or more of a rule, separated by commas.
 *
 * @param {RuleOrLiteral} rule
 * @returns {ChoiceRule}
 */
function commaSep(rule) {
  return optional(commaSep1(rule));
}
