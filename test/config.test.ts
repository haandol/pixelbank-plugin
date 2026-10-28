import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_BASE, REDIRECT_URI, validateOAuth, resolveBase } from '../src/config.js';
const resource = 'https://api.pixelbankstudio.com/mcp';
const config = {
 issuer:'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_fixture',clientId:'client',
 authorizationEndpoint:'https://fixture.auth.us-east-1.amazoncognito.com/oauth2/authorize',
 tokenEndpoint:'https://fixture.auth.us-east-1.amazoncognito.com/oauth2/token',
 revocationEndpoint:'https://fixture.auth.us-east-1.amazoncognito.com/oauth2/revoke',
 resource,scopes:['openid',`${resource}/studio.read`,`${resource}/studio.write`,`${resource}/studio.execute`],redirectUri:REDIRECT_URI,
};
test('Cognito configuration binds creative scopes to the fixed MCP resource',()=>{
 assert.equal(validateOAuth(config,DEFAULT_BASE).resource,resource);
 assert.equal(validateOAuth({...config,scopes:['openid',`${resource}/studio.read`]},DEFAULT_BASE).scopes.length,2);
});
test('resource, redirect, endpoint and permission substitutions are rejected',()=>{
 for(const changed of [
  {...config,resource:'https://other.example/mcp'},
  {...config,redirectUri:'http://localhost:18765/oauth/callback'},
  {...config,tokenEndpoint:'https://other.example/token'},
  {...config,issuer:'http://other.example/issuer'},
  {...config,scopes:['openid']},
  {...config,scopes:[...config.scopes,'aws.cognito.signin.user.admin']},
  {...config,scopes:[...config.scopes,config.scopes[1]]},
  {...config,scopes:['openid',`${resource}/studio.read`,`${resource}/studio.execute`]},
 ]) assert.throws(()=>validateOAuth(changed,DEFAULT_BASE),{code:'INVALID_CONFIG'});
});
test('explicit local configuration keeps resource and API on the same origin',()=>{
 const base='http://127.0.0.1:19000/v1/mcp',localResource='http://127.0.0.1:19000/mcp';
 assert.equal(resolveBase(base),base);
 assert.equal(validateOAuth({...config,resource:localResource,scopes:['openid',`${localResource}/studio.read`]},base).resource,localResource);
 assert.throws(()=>validateOAuth(config,base),{code:'INVALID_CONFIG'});
 for(const url of ['https://other.example','http://user@localhost:19000','http://127.1:19000','http://localhost:19000?token=value','http://localhost:19000#x'])assert.throws(()=>resolveBase(url),{code:'INVALID_CONFIG'});
});
