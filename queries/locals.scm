; SPDX-License-Identifier: GPL-3.0-or-later
; Copyright (C) 2026 QuakeC Studio contributors
;
; QC-12.1: there are two scopes, global and the function being defined; blocks open none.
; A function's parameters are written in the type of its declaration, outside the body, so
; the scope is the whole declaration.

(source_file) @local.scope

(declaration
  type: (function_type)) @local.scope

; QC-13.2: the parameters of the defining declaration, and the function's locals.

(parameter
  name: (identifier) @local.definition)

(local_declaration
  declarator: (declarator
    name: (identifier) @local.definition))

; A field name after `.` names a field, never a local, so only other names are references.

(field_expression
  object: (identifier) @local.reference)

(call_expression
  function: (identifier) @local.reference)

(argument_list
  (identifier) @local.reference)

(assignment_expression
  [
    left: (identifier) @local.reference
    right: (identifier) @local.reference
  ])

(binary_expression
  [
    left: (identifier) @local.reference
    right: (identifier) @local.reference
  ])

(not_expression
  operand: (identifier) @local.reference)

(parenthesized_expression
  (identifier) @local.reference)

(return_statement
  value: (identifier) @local.reference)

(if_statement
  condition: (identifier) @local.reference)

(while_statement
  condition: (identifier) @local.reference)

(do_statement
  condition: (identifier) @local.reference)

(expression_statement
  (identifier) @local.reference)
