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

/** Endpoint is a high-level way of a connection between a service and an IP.
 * @deprecated */
export interface Endpoint {
	/** The hostname of the DNS record
	 * @deprecated */
	DNSName: string;
	/** The targets the DNS record points to
	 * @deprecated */
	Targets: Array<string>;
	/** RecordType type of record, e.g. CNAME, A, SRV, TXT etc
	 * @deprecated */
	RecordType: string;
	/** TTL for the record
	 * @deprecated */
  RecordTTL?: number;
	/** Labels stores labels defined for the Endpoint
	 * @deprecated */
  Labels?: Record<string,string>;

  /** Priority for MX or SRV records
	 * @deprecated */
  Priority?: number;
	/** Identifier to distinguish multiple records with the same name and type (e.g. Route53 records with routing policies other than 'simple')
	 * @deprecated */
	SetIdentifier?: string;
  /** Kubernetes annotations useful for filtering
	 * @deprecated */
  Annotations?: Record<string,string>;

	/** ProviderSpecific stores provider specific config
	 * @deprecated */
	ProviderSpecific?: Array<ProviderSpecificProperty>;
}

/** ProviderSpecificProperty holds the name and value of a configuration which is specific to individual DNS providers
 * @deprecated */
export interface ProviderSpecificProperty {
	Name:  string;
	Value: string;
}

/** Changes holds lists of actions to be executed by dns providers
 * @deprecated */
export class Changes<T extends BaseRecord> {
	constructor(
		public sourceRecords: Endpoint[],
		public existingRecords: Endpoint[],
	) {}

	/** Records that need to be created
	 * @deprecated */
	Create = new Array<Endpoint>();
	/** Records that need to be updated (current data, desired data)
	 * @deprecated */
	Update = new Array<[Endpoint,Endpoint]>();
	/** Records that need to be deleted
	 * @deprecated */
	Delete = new Array<Endpoint>();

	get length() {
		return this.Create.length + this.Update.length + this.Delete.length;
	}

	get summary() {
		return [
			this.Create.length, 'creates,',
			this.Update.length, 'updates,',
			this.Delete.length, 'deletes'];
	}
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
	target: string;
	priority: number;
}

// TODO: also SRV

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
