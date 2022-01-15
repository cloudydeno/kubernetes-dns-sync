export interface DnsProvider<
	Trecord extends BaseRecord,
> {
	ListZones(): Promise<Array<Zone>>;
	ListRecords(zone: Zone): Promise<Array<Trecord>>;
	ApplyChanges(state: ZoneState<Trecord>): Promise<void>;

	EnrichSourceRecord(record: SourceRecord): Trecord | null;
	ComparisionKey(record: Trecord): string;
	GroupingKey(record: Trecord): string;
}

// Source defines the interface Endpoint sources should implement.
export interface DnsSource {
	config: {type: string};
	ListRecords(): Promise<Array<SourceRecord>>;
	ObserveResource?(resourceKey: string): Promise<void>;
	// MakeEventSource adds an event handler that should be triggered if something in source changes
  MakeEventSource(): AsyncGenerator<void>;
}

export interface DnsRegistry<
	Tsource extends BaseRecord,
	Tinner extends Tsource,
	// Tstate extends ZoneState<Tinner>
> {
	RecognizeLabels(provider: ZoneState<Tsource>): Promise<ZoneState<Tinner>>;
	CommitLabels(inner: ZoneState<Tinner>): Promise<ZoneState<Tsource>>;
}

/** Zone is a basic structure indicating what DNS names are available */
export interface Zone {
	/** The hostname of the DNS zone, without trailing dot */
	DNSName: string;
	/** The vanity name of the DNS zone, if any */
	ZoneName?: string;
	/** The provider's opaque ID for this zone. */
	ZoneID: string;
}

export interface SourceRecord extends BaseRecord {
	/** Composite string identifying where this bundle came from */
	resourceKey: string;
  /** Kubernetes annotations useful for filtering and extra behavior */
  annotations: Record<string, string>;
}
export interface BaseRecord {
	/**  */
	// zoneId: string;
	/** NON-UNIQUE identifier for this DNSrecord */
	// externalId?: string;
	/** The actual DNS data */
	dns: PlainRecord;
}

export type PlainRecord = {
	fqdn: string;
	ttl?: number | null;
} & PlainRecordData;

export type PlainRecordData =
	| PlainRecordAddress
	| PlainRecordString
	| PlainRecordHostname
	| PlainRecordMX
	| PlainRecordSRV
	| PlainRecordSOA
;

export type PlainRecordAddress = {
	type: 'A' | 'AAAA';
	target: string;
}

export type PlainRecordHostname = {
	type: 'CNAME' | 'NS';
	target: string;
}

export type PlainRecordString = {
	type: 'TXT';
	content: string;
}

export type PlainRecordMX = {
	type: 'MX';
	priority: number;
	target: string;
}

export type PlainRecordSRV = {
	type: 'SRV';
	priority: number;
	weight: number;
	port: number;
	target: string;
}

export type PlainRecordSOA = {
	type: 'SOA';
	sourceHost: string;
	contactHost: string;
	serial: number;
	refresh: number;
	retry: number;
	expire: number;
	minimum: number;
}

export const AllSupportedRecords: Record<PlainRecordData['type'], true> = {
  'A': true,
  'AAAA': true,
  'NS': true,
  'CNAME': true,
  'TXT': true,
  'MX': true,
	'SOA': true,
	'SRV': true,
};

export interface ZoneState<Trecord extends BaseRecord> {
	Zone: Zone;
	Existing: Array<Trecord>;
	Desired?: Array<Trecord>;
	Diff?: Array<RecordGroupDiff<Trecord>>;
}

/** Diff holds lists of actions to be executed by dns providers */
// export interface ZoneDiff<Trecord extends BaseRecord> {
// 	state: ZoneState<Trecord>;
// 	toDelete: Array<Trecord>;
// 	// TODO: toUpdate: Map<Trecord, Trecord>;
// 	toCreate: Array<Trecord>;
// }

export interface RecordGroupDiff<Trecord extends BaseRecord> {
	type: 'creation' | 'update' | 'deletion';
	existing: Array<Trecord>;
	desired: Array<Trecord>;

	toDelete: Array<Trecord>;
	toCreate: Array<Trecord>;
	toUpdate: Array<{existing: Trecord, desired: Trecord}>;
}
