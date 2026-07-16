/// <reference path="../pb_data/types.d.ts" />

/**
 * PoopBook schema. PocketBase (v0.23+) applies every file in pb_migrations
 * automatically on startup, so running the server once is enough.
 *
 * Access model: PoopBook is a closed group of friends, so any authenticated
 * user may read everyone's poops and leagues (needed for league maps and
 * leaderboards) — but records can only be created for yourself and only
 * modified by their owner.
 */
migrate(
	(app) => {
		// Let authenticated users see each other (member search, leaderboards).
		const users = app.findCollectionByNameOrId('users');
		users.listRule = '@request.auth.id != ""';
		users.viewRule = '@request.auth.id != ""';
		app.save(users);

		const poops = new Collection({
			name: 'poops',
			type: 'base',
			listRule: '@request.auth.id != ""',
			viewRule: '@request.auth.id != ""',
			createRule: '@request.auth.id != "" && @request.body.user = @request.auth.id',
			updateRule: 'user = @request.auth.id',
			deleteRule: 'user = @request.auth.id',
			fields: [
				{
					name: 'user',
					type: 'relation',
					required: true,
					collectionId: '_pb_users_auth_',
					cascadeDelete: true,
					maxSelect: 1
				},
				{ name: 'timestamp', type: 'date', required: true },
				{ name: 'latitude', type: 'number' },
				{ name: 'longitude', type: 'number' },
				{ name: 'note', type: 'text' },
				{ name: 'place', type: 'text' },
				{ name: 'rating', type: 'number', min: 1, max: 5 },
				{ name: 'created', type: 'autodate', onCreate: true },
				{ name: 'updated', type: 'autodate', onCreate: true, onUpdate: true }
			],
			indexes: ['CREATE INDEX idx_poops_user ON poops (user)']
		});
		app.save(poops);

		const leagues = new Collection({
			name: 'leagues',
			type: 'base',
			listRule: '@request.auth.id != ""',
			viewRule: '@request.auth.id != ""',
			createRule: '@request.auth.id != "" && @request.body.owner = @request.auth.id',
			// Any authenticated user may update a league so friends can add
			// themselves to `members` (join). Fine for a closed friend group.
			updateRule: '@request.auth.id != ""',
			deleteRule: 'owner = @request.auth.id',
			fields: [
				{ name: 'name', type: 'text', required: true },
				{
					name: 'owner',
					type: 'relation',
					required: true,
					collectionId: '_pb_users_auth_',
					cascadeDelete: false,
					maxSelect: 1
				},
				{
					name: 'members',
					type: 'relation',
					collectionId: '_pb_users_auth_',
					cascadeDelete: false,
					maxSelect: 999
				},
				{ name: 'created', type: 'autodate', onCreate: true },
				{ name: 'updated', type: 'autodate', onCreate: true, onUpdate: true }
			]
		});
		app.save(leagues);
	},
	(app) => {
		for (const name of ['leagues', 'poops']) {
			try {
				app.delete(app.findCollectionByNameOrId(name));
			} catch {
				// already gone
			}
		}
	}
);
