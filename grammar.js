// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 QuakeC Studio contributors

/**
 * @file Vanilla QuakeC: the language id's qcc accepts.
 *
 * The rules follow docs/spec/language.md in quakecstudio/editor (prefix QC), which is written
 * from id's qcc at id-Software/Quake-Tools@c0d1b91c74eb654365ac7755bc837e497caaca73. Comments
 * name the statement each rule implements. README.md lists where the grammar is more lenient
 * than qcc.
 */

/// <reference types="tree-sitter-cli/dsl" />
// @ts-check

// QC-15.1, loosest first. `!` sits between `=` and the comparisons because its operand is an
// expression at the comparisons' priority (QC-15.6).
const PREC = {
  logical: 1,
  assign: 2,
  not: 3,
  compare: 4,
  add: 5,
  multiply: 6,
  postfix: 7,
};

// Whitespace on one line: every byte from 0x01 to 0x20 except LF (QC-2.1).
const BLANKS = /[\x01-\x09\x0b-\x20]+/;

module.exports = grammar({
  name: 'quakec',

  word: $ => $.identifier,

  extras: $ => [
    // QC-2.1 and QC-1.3: bytes up to 0x20, and every non-ASCII character outside a string.
    /[\x01-\x20]/,
    /[^\x00-\x7f]/,
    $.comment,
  ],

  rules: {
    // QC-11.1: a file is a sequence of declarations; QC-8 and QC-9 add `$` commands and
    // preprocessor directives.
    source_file: $ => repeat($._top_level_item),

    _top_level_item: $ => choice(
      $.declaration,
      $.frame_definition,
      $.model_command,
      $._preproc,
    ),

    // QC-2.2, QC-2.3: `//` to the end of the line; `/*` to the first `*/` found from the `*`
    // of the `/*`, so `/*/` is a whole comment.
    comment: _ => token(choice(
      seq('//', /[^\n]*/),
      /\/\*(\/|([^*\/][^*]*)?\*+([^\/*][^*]*\*+)*\/)/,
    )),

    // QC-3.1. No name is reserved (QC-3.2): a keyword is one only where the parser expects
    // it, which tree-sitter's context-aware lexing gives for free.
    identifier: _ => /[A-Za-z_][A-Za-z0-9_]*/,

    // QC-10 Types.

    _type: $ => choice($.simple_type, $.field_type, $.function_type),

    // QC-10.1
    simple_type: _ => choice('void', 'float', 'vector', 'string', 'entity'),

    // QC-10.2: `.T` for any type T, including `..float`.
    field_type: $ => seq('.', field('type', $._type)),

    // QC-10.3, QC-10.5: a simple return type and a parameter list, never returning a function.
    function_type: $ => seq(
      field('return_type', $.simple_type),
      field('parameters', $.parameter_list),
    ),

    // QC-10.3, QC-10.4: named parameters, none, or `...` alone.
    parameter_list: $ => seq(
      '(',
      optional(choice('...', commaSep1($.parameter))),
      ')',
    ),

    parameter: $ => seq(field('type', $._type), field('name', $.identifier)),

    // QC-11 Declarations.

    // QC-11.1: a type, names separated by `,`, then `;`.
    declaration: $ => seq(
      field('type', $._type),
      commaSep1(field('declarator', $.declarator)),
      ';',
    ),

    // QC-11.2, QC-11.3, QC-13.1: a literal, or a function body, state body or builtin.
    declarator: $ => seq(
      field('name', $.identifier),
      optional(seq('=', choice(
        field('value', choice($._constant, $.builtin)),
        field('body', $.function_body),
        seq(field('state', $.state), field('body', $.function_body)),
      ))),
    ),

    _constant: $ => choice(
      $.float_literal,
      $.vector_literal,
      $.string_literal,
      $.frame_reference,
    ),

    // QC-13.3: `#n`, the engine builtin number n.
    builtin: $ => seq('#', field('number', $.float_literal)),

    // QC-13.6: `[frame, next]`.
    state: $ => seq(
      '[',
      field('frame', choice($.float_literal, $.frame_reference)),
      ',',
      field('next', $.identifier),
      ']',
    ),

    // QC-13.1: an empty body is allowed.
    function_body: $ => seq('{', repeat($._statement), '}'),

    // QC-14 Statements.

    _statement: $ => choice(
      $.block,
      $.local_declaration,
      $.return_statement,
      $.if_statement,
      $.while_statement,
      $.do_statement,
      $.expression_statement,
      $._preproc,
    ),

    // QC-14.2: a block inside a body holds at least one statement; there is no `;` alone.
    block: $ => seq('{', repeat1($._statement), '}'),

    // QC-11.10: the declaration grammar, with a literal as the only initialiser.
    local_declaration: $ => seq(
      'local',
      field('type', $._type),
      commaSep1(field('declarator', alias($._local_declarator, $.declarator))),
      ';',
    ),

    _local_declarator: $ => seq(
      field('name', $.identifier),
      optional(seq('=', field('value', $._constant))),
    ),

    // QC-14.3
    return_statement: $ => seq('return', optional(field('value', $._expression)), ';'),

    // QC-14.4, QC-14.7: `else` binds to the nearest `if`.
    if_statement: $ => prec.right(seq(
      'if',
      '(',
      field('condition', $._expression),
      ')',
      field('consequence', $._statement),
      optional(seq('else', field('alternative', $._statement))),
    )),

    // QC-14.5
    while_statement: $ => seq(
      'while',
      '(',
      field('condition', $._expression),
      ')',
      field('body', $._statement),
    ),

    // QC-14.6: the `;` is required.
    do_statement: $ => seq(
      'do',
      field('body', $._statement),
      'while',
      '(',
      field('condition', $._expression),
      ')',
      ';',
    ),

    // QC-14.9
    expression_statement: $ => seq($._expression, ';'),

    // QC-15 Expressions.

    _expression: $ => choice(
      $.assignment_expression,
      $.binary_expression,
      $.not_expression,
      $.field_expression,
      $.call_expression,
      $._primary_expression,
    ),

    // QC-15.7: the terms other than `!`.
    _primary_expression: $ => choice(
      $.identifier,
      $.float_literal,
      $.vector_literal,
      $.string_literal,
      $.frame_reference,
      $.parenthesized_expression,
    ),

    parenthesized_expression: $ => seq('(', $._expression, ')'),

    // QC-15.8: field access chains, `e.en.hp` is `(e.en).hp`; a call is not an operand of
    // `.`, so `g().fl` does not parse.
    field_expression: $ => prec.left(PREC.postfix, seq(
      field('object', choice($._primary_expression, $.field_expression)),
      '.',
      field('field', $._primary_expression),
    )),

    // QC-15.8, QC-18.7: the callee is a term or a field access, so `g()()` does not parse.
    call_expression: $ => prec(PREC.postfix, seq(
      field('function', choice($._primary_expression, $.field_expression)),
      field('arguments', $.argument_list),
    )),

    argument_list: $ => seq('(', commaSep($._expression), ')'),

    // QC-15.6: the only prefix operator; its operand reaches down to the comparisons.
    not_expression: $ => prec(PREC.not, seq('!', field('operand', $._expression))),

    // QC-15.3, QC-17.1: `=` is right-associative and binds tighter than `&&` and `||`.
    assignment_expression: $ => prec.right(PREC.assign, seq(
      field('left', $._expression),
      '=',
      field('right', $._expression),
    )),

    // QC-15.1, QC-15.2, QC-15.4, QC-15.5: all binary operators associate left.
    binary_expression: $ => choice(...[
      [PREC.multiply, choice('*', '/', '&', '|')],
      [PREC.add, choice('+', '-')],
      [PREC.compare, choice('==', '!=', '<=', '>=', '<', '>')],
      [PREC.logical, choice('&&', '||')],
    ].map(([precedence, operator]) => prec.left(/** @type {number} */ (precedence), seq(
      field('left', $._expression),
      // @ts-ignore
      field('operator', operator),
      field('right', $._expression),
    )))),

    // QC-4 to QC-6 Literals.

    // QC-4.1, QC-4.3, QC-4.4: a digit, or `-` and a digit, then digits and dots. No exponent,
    // hex or suffix, and no leading `.`.
    float_literal: _ => /-?[0-9][0-9.]*/,

    // QC-5.1 to QC-5.3: three components between single quotes, with whitespace and comments
    // between them. A component's first byte is taken whatever it is.
    vector_literal: $ => seq(
      '\'',
      field('x', $._vector_component),
      field('y', $._vector_component),
      field('z', $._vector_component),
      '\'',
    ),

    _vector_component: $ => alias(token(/[^\x00-\x20'][0-9.]*/), $.float_literal),

    // QC-6.1 to QC-6.3: no line break inside, and only the escapes `\n` and `\"`.
    string_literal: $ => seq(
      '"',
      repeat(choice(
        alias(token.immediate(prec(1, /[^"\\\n]+/)), $.string_content),
        $.escape_sequence,
      )),
      token.immediate('"'),
    ),

    escape_sequence: _ => token.immediate(/\\[n"]/),

    // QC-8 Frame macros and `$` commands.

    // QC-8.1, QC-8.5, QC-8.6: the word runs to the next whitespace, `,` or `;`.
    frame_reference: _ => token(seq('$', /[ \t]*/, /[^\x00-\x20,;]+/)),

    // QC-8.2: `$frame` and the names after it on the same line, split at whitespace.
    frame_definition: $ => seq(
      '$',
      'frame',
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

    // QC-9 Preprocessor: each directive is one line, standing where a declaration or a
    // statement can.

    _preproc: $ => choice(
      $.preproc_include,
      $.preproc_define,
      $.preproc_undef,
      $.preproc_ifdef,
      $.preproc_else,
      $.preproc_endif,
      $.preproc_call,
    ),

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

    preproc_params: $ => seq(token.immediate('('), commaSep($.identifier), ')'),

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
    // FTEQCC's `#pragma` and `#if` do not break the rest of the file.
    preproc_call: $ => seq(
      field('directive', $.preproc_directive),
      optional(field('argument', $.preproc_arg)),
      token.immediate(/\r?\n/),
    ),

    preproc_directive: _ => /#[ \t]*[A-Za-z_][A-Za-z0-9_]*/,

    preproc_arg: _ => token(prec(-1, /\S([^\/\n]|\/[^*\/\n])*/)),
  },
});

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
