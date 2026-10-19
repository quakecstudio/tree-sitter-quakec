; SPDX-License-Identifier: GPL-3.0-or-later
; Copyright (C) 2026 QuakeC Studio contributors
;
; QC-12.1: there are two scopes, global and the function being defined; blocks open none.
; A function's parameters are written in the type of its declaration, outside the body, so
; the scope is the whole declaration. FTEQCC keeps that rule by default (its blocks scope
; locals only with `pr_subscopedlocals`), and adds C-style definitions, whose parameters
; follow the name.

(source_file) @local.scope

(declaration
  type: (function_type)) @local.scope

(declarator
  parameters: (parameter_list)) @local.scope

; QC-13.2: the parameters of the defining declaration, and the function's locals, with or
; without `local`.

(parameter
  name: (identifier) @local.definition)

(local_declaration
  declarator: (declarator
    name: (identifier) @local.definition))

(function_body
  (declaration
    declarator: (declarator
      name: (identifier) @local.definition)))

(block
  (declaration
    declarator: (declarator
      name: (identifier) @local.definition)))

(for_statement
  initializer: (declaration
    declarator: (declarator
      name: (identifier) @local.definition)))

; A field name after `.` names a field, never a local, so only other names are references.

(field_expression
  object: (identifier) @local.reference)

(subscript_expression
  [
    object: (identifier) @local.reference
    index: (identifier) @local.reference
  ])

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

(conditional_expression
  [
    condition: (identifier) @local.reference
    consequence: (identifier) @local.reference
    alternative: (identifier) @local.reference
  ])

(comma_expression
  [
    left: (identifier) @local.reference
    right: (identifier) @local.reference
  ])

(not_expression
  operand: (identifier) @local.reference)

(unary_expression
  operand: (identifier) @local.reference)

(update_expression
  operand: (identifier) @local.reference)

(cast_expression
  value: (identifier) @local.reference)

(parenthesized_expression
  (identifier) @local.reference)

(vector_expression
  (identifier) @local.reference)

(initializer_list
  (identifier) @local.reference)

(declarator
  value: (identifier) @local.reference)

(return_statement
  value: (identifier) @local.reference)

(if_statement
  condition: (identifier) @local.reference)

(while_statement
  condition: (identifier) @local.reference)

(do_statement
  condition: (identifier) @local.reference)

(for_statement
  [
    initializer: (identifier) @local.reference
    condition: (identifier) @local.reference
    update: (identifier) @local.reference
  ])

(switch_statement
  condition: (identifier) @local.reference)

(case_statement
  [
    value: (identifier) @local.reference
    end: (identifier) @local.reference
  ])

(expression_statement
  (identifier) @local.reference)
