// Lambda entry point that imports the Express serverless handler
const path = require('path');

// This points to the built Lambda handler in the root of the project
const { handler } = require('../../../../../dist/lambda.js');

exports.handler = async (event, context) => {
  console.log('EVENT: ', JSON.stringify(event, null, 2));
  return await handler(event, context);
};