// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 QuakeC Studio contributors

entity() spawn = #14;
// <- type.builtin
//       ^ function.builtin
//             ^ operator
//               ^ punctuation.special
//                ^ number

.float health;
// <- punctuation.delimiter
//^ type.builtin
//     ^ property

float MOVETYPE_BOUNCE = 10;
//    ^ constant

$frame stand1 stand2
// <- keyword
// ^ keyword
//     ^ constant

void(entity targ, float damage) T_Damage =
// <- type.builtin
//          ^ variable.parameter
//                      ^ variable.parameter
//                              ^ function
{
  local vector dir;
//^ keyword
//      ^ type.builtin
//             ^ variable

  if (targ.health <= 0)
//^ keyword
//    ^ variable.parameter
//         ^ property
//                ^ operator
    return;
//  ^ keyword

  dir = '0 0 1' * damage;
//      ^ number
//                ^ variable.parameter
  targ.health = targ.health - damage;
//^ variable.parameter
//     ^ property
  self.frame = $stand2;
//^ variable.builtin
//             ^ constant
  sound (self, CHAN_VOICE, "player/pain1.wav\n", 1, ATTN_NORM);
//^ function
//       ^ variable.builtin
//             ^ constant
//                         ^ string
//                                          ^ string.special
};

void() player_stand1 = [$stand1, player_stand1] { };
//                      ^ constant
//                               ^ function
