import 'dotenv/config';

const port = Number(process.env.PORT ?? 5000);

console.log(`api bootstrap ready on port ${port}`);
