module.exports = {
	apps: [
		{
			name: 'poopbook-pb',
			script: './pocketbase/pocketbase',
			args: 'serve --http=127.0.0.1:8090',
			cwd: '/home/delta/Builds/Poopbook',
			interpreter: 'none'
		}
	]
};
