mod node;
mod flow;

use node::Node;
use flow::Flow;

fn main() {
    let n = Node {
        name: "Start".to_string(),
    };

    let f = Flow {
        nodes: vec![n],
    };

    println!("Flow hat {} Node(s).", f.nodes.len());
}
