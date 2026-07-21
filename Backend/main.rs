mod node;
mod flow;

use crate::flow::Flow;
use crate::node::Node;
use tiny_http::{Server, Response};
use serde::Serialize;

#[derive(Serialize)]
struct ApiResponse {
    status: String,
    nodes: usize,
}

fn main() {

    let n1 = Node::EventNode;
    let n2 = Node::FlowNode;
    let n3 = Node::WorkerNode;


    let flow = Flow {
        nodes: vec![n1, n2, n3],
    };

  
    flow.run();

    let server = Server::http("0.0.0.0:8080").unwrap();
    println!("Server started on http://localhost:8080");

    for request in server.incoming_requests() {
        
        let nodecount = flow.nodes.len();

        
        let antwort = ApiResponse {
            status: "running".to_string(),
            nodes: nodecount,
        };
        let json = serde_json::to_string(&antwort).unwrap();

        
        let response = Response::from_string(json);

        let header = "Content-Type: application/json".parse::<tiny_http::Header>().unwrap();
        let response = response.with_header(header);

        request.respond(response).unwrap();
    }
}
