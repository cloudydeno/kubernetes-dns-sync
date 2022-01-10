// Derivitive of https://stackoverflow.com/a/38563466/3582903
// Spec: https://www.ietf.org/rfc/rfc1035.html#section-5.1
export function readTxtValue(s: string) {
  // return raw.split(/("[^"\\] +/).join('');
  var res = [];
  var tmp = "";
  var in_quotes = false;
  var in_entity = false;
  for (var i=0; i<s.length; i++) {
    if (s[i] === '\\' && in_entity  === false) {
      in_entity = true;
      // if (in_quotes === true) {
      //   tmp += s[i];
      // }
    } else if (in_entity === true) { // add a match
        in_entity = false;
        if (in_quotes === true) {
          tmp += s[i];
        }
    } else if (s[i] === '"' && in_quotes === false) { // start a new match
        in_quotes = true;
        // tmp += s[i];
    } else if (s[i] === '"'  && in_quotes === true) { // append char to match and add to results
        // tmp += s[i];
        res.push(tmp);
        tmp = "";
        in_quotes = false;
    } else if (in_quotes === true) { // append a char to the match
      tmp += s[i];
    } else if (s[i] != ' ') { // append a char to the match
      tmp += s[i];
    }
  }
  if (tmp) res.push(tmp);
  return res.join('');
}
