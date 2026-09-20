import Document,{Html,Head,Main,NextScript,DocumentContext} from 'next/document';
export default class AppDocument extends Document<{nonce?:string}> {
 static async getInitialProps(ctx:DocumentContext) {
  const initial=await Document.getInitialProps(ctx);
  return {...initial,nonce:typeof ctx.req?.headers['x-csp-nonce']==='string'?ctx.req.headers['x-csp-nonce']:undefined};
 }
 render(){return <Html><Head nonce={this.props.nonce}><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" /></Head><body><Main/><NextScript nonce={this.props.nonce}/></body></Html>;}
}
