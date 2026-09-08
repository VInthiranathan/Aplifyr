import Document,{Html,Head,Main,NextScript,DocumentContext} from 'next/document';
export default class AppDocument extends Document<{nonce?:string}> {
 static async getInitialProps(ctx:DocumentContext) {
  const initial=await Document.getInitialProps(ctx);
  return {...initial,nonce:typeof ctx.req?.headers['x-csp-nonce']==='string'?ctx.req.headers['x-csp-nonce']:undefined};
 }
 render(){return <Html><Head nonce={this.props.nonce}/><body><Main/><NextScript nonce={this.props.nonce}/></body></Html>;}
}
