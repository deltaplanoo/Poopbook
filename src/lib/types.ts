import type { RecordModel } from 'pocketbase';

export interface UserRecord extends RecordModel {
	name: string;
	email?: string;
	avatar?: string;
}

export interface Poop extends RecordModel {
	user: string;
	timestamp: string;
	latitude: number;
	longitude: number;
	note: string;
	place: string;
	rating: number;
	expand?: {
		user?: UserRecord;
	};
}

export interface League extends RecordModel {
	name: string;
	owner: string;
	members: string[];
	expand?: {
		owner?: UserRecord;
		members?: UserRecord[];
	};
}
