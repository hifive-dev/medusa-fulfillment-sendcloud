## Install


Please install the plugin through these commands in your terminal and in the project directory.|

```js
yarn add medusa-latest-sendcloud
yarn build
```


## Prepare

**In the medusa.config.js file in backend, you have to include the following in the plugins array**


```js
{
resolve: `medusa-latest-sendcloud`,
options: {
token:
"<API_KEY_FOR_SENDCLOUD>",
enableUI: true,
},
}
```

