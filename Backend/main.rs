mod node;
mod flow;

use crate::flow::Flow;
use crate::node::Node;

fn main() {
    let n1 = Node { name: "Start".to_string() };
    let n2 = Node { name: "Process".to_string() };
    let n3 = Node { name: "End".to_string() };

    let flow = Flow {
        nodes: vec![n1, n2, n3],
    };

    flow.run();
}
