### Launching the bot

1. Install all dependencies

	```
	npm install
	```
2. Create an .env file using .env.template as a template.
3. Populate database with first 100 words: node maintenance/populate.js

	```
	npm run-script populate
	```
4. Start the bot:

	```
	npm start
	```