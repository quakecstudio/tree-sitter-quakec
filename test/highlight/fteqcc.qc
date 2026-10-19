// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 QuakeC Studio contributors

const float NO_INTERMISSION = 1;
// <- keyword
//    ^ type.builtin
//          ^ constant

enum { A, B };
// <- keyword
//     ^ constant

class ncEntity : ncIO
// <- keyword
//    ^ type
//               ^ type
{
public:
// <- keyword
  virtual void Spawned(void);
//^ keyword
//        ^ type.builtin
//             ^ function
};

void
ncEntity::Spawned(void)
// <- type
//        ^ function
{
  int i;
//^ type.builtin
//    ^ variable
  for (i = 0; i < 3; i++)
//^ keyword
//     ^ variable
//                    ^ operator
    m_flHealth += 1;
//             ^ operator
  switch (i)
//^ keyword
  {
    case A:
//  ^ keyword
//       ^ constant
      break;
//    ^ keyword
  }
  e = (ncPlayer)self.owner;
//     ^ type
//              ^ variable.builtin
//                   ^ property
  string s = 'a';
//^ type.builtin
//           ^ string
}

float Bot_Think(float a)
//    ^ function
//              ^ type.builtin
//                    ^ variable.parameter
{
  a = a ? -a : a;
//^ variable.parameter
//      ^ operator
//         ^ variable.parameter
  INHIBIT_COOP
//^ constant
  if (a)
    return a;
  SAVE_STATE(a)
//^ function
  return a;
//       ^ variable.parameter
}
