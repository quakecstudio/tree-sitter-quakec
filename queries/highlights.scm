; SPDX-License-Identifier: GPL-3.0-or-later
; Copyright (C) 2026 QuakeC Studio contributors
;
; Capture names are the tree-sitter CLI's standard set. A later pattern takes precedence over
; an earlier one for the same node, so the general patterns come first.

(identifier) @variable

((identifier) @constant
  (#match? @constant "^[A-Z][A-Z0-9_]*$"))

((identifier) @variable.builtin
  (#any-of? @variable.builtin "self" "other" "world"))

; Keywords and types

[
  "local"
  "return"
  "if"
  "else"
  "while"
  "do"
] @keyword

(simple_type) @type.builtin

; Operators and punctuation

[
  "="
  "=="
  "!="
  "<"
  ">"
  "<="
  ">="
  "+"
  "-"
  "*"
  "/"
  "&"
  "|"
  "&&"
  "||"
  "!"
] @operator

[
  "("
  ")"
  "["
  "]"
  "{"
  "}"
] @punctuation.bracket

[
  ","
  ";"
  "."
] @punctuation.delimiter

"..." @punctuation.special

(builtin
  "#" @punctuation.special)

; Literals

(float_literal) @number

(vector_literal
  "'" @number)

(string_literal) @string

(escape_sequence) @string.special

; `$` commands and frame macros

(frame_definition
  [
    "$"
    "frame"
  ] @keyword)

(model_command
  "$" @keyword
  name: (identifier) @keyword)

(command_arguments) @string.special

(frame_name) @constant

(frame_reference) @constant

; Preprocessor

[
  "#include"
  "#define"
  "#undef"
  "#ifdef"
  "#ifndef"
  "#else"
  "#endif"
  (preproc_directive)
] @keyword

(preproc_define
  name: (identifier) @constant)

(preproc_params
  (identifier) @variable.parameter)

; Uses

(field_expression
  field: (identifier) @property)

(call_expression
  function: (identifier) @function)

(call_expression
  function: (field_expression
    field: (identifier) @function))

; Definitions

(parameter
  name: (identifier) @variable.parameter)

(state
  next: (identifier) @function)

(declaration
  type: (field_type)
  declarator: (declarator
    name: (identifier) @property))

(declaration
  type: (function_type)
  declarator: (declarator
    name: (identifier) @function))

(declaration
  type: (function_type)
  declarator: (declarator
    name: (identifier) @function.builtin
    value: (builtin)))

(comment) @comment
