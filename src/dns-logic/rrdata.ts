import type { PlainRecord, PlainRecordData } from "../types.ts";

// This file is useful for integrating providers that
// expose the raw 'rrdata' strings in their API,
// as opposed to having their own JSON structures for e.g. MX priority.

export function transformFromRrdata(rType: PlainRecord['type'], rrdata: string): PlainRecordData {
  switch (rType) {
    case 'A':
    case 'AAAA':
    case 'CNAME':
    case 'NS':
    // case 'PTR':
      return {
        type: rType,
        target: rrdata.replace(/\.$/, ''),
      };
    case 'TXT':
      return {
        type: rType,
        content: readTxtValue(rrdata),
      };
    case 'MX': {
      const [priority, target] = rrdata.split(' ');
      return {
        type: rType,
        priority: parseInt(priority, 10),
        target: target.replace(/\.$/, ''),
      };
    };
    case 'SOA': {
      const [sourceHost, contactHost, ...numbers] = rrdata.split(' ');
      const [serial, refresh, retry, expire, minimum] = numbers.map(x => parseInt(x, 10));
      return {
        type: rType,
        sourceHost: sourceHost.replace(/\.$/, ''),
        contactHost: contactHost.replace(/\.$/, ''),
        serial, refresh, retry, expire, minimum,
      };
    };
    case 'SRV': {
      const [priority, weight, port, target] = rrdata.split(' ');
      return {
        type: rType,
        priority: parseInt(priority, 10),
        weight: parseInt(weight, 10),
        port: parseInt(port, 10),
        target: target.replace(/\.$/, ''),
      };
    };
    // for the future: https://cloud.google.com/dns/docs/reference/json-record
    default:
      const _: never = rType;
  }
  throw new Error(`TODO: unsupported record type ${rType} observed for ${rrdata}`);
}

export function transformToRrdata(desired: PlainRecord): string {
  switch (desired.type) {
    case 'A':
    case 'AAAA':
      return desired.target;
    case 'CNAME':
    case 'NS':
      return `${desired.target}.`;
    case 'MX':
      return `${desired.priority} ${desired.target}.`;
    case 'TXT':
      return (desired.content
          .match(/.{1,220}/g) ?? []) // TODO: imprecise art
          .map(x => `"${x.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`)
          .join(' ');
    case 'SOA':
      return [
        `${desired.sourceHost}.`, `${desired.contactHost}.`,
        `${desired.serial}`, `${desired.refresh}`, `${desired.retry}`,
        `${desired.expire}`, `${desired.minimum}`,
      ].join(' ');
    case 'SRV':
      return `${desired.priority} ${desired.weight} ${desired.port} ${desired.target}.`;
    // for the future: https://cloud.google.com/dns/docs/reference/json-record
    default:
      const _: never = desired;
  }
  throw new Error(`BUG: unsupported record ${JSON.stringify(desired)} desired`);
}


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
