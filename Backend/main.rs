mod node;
mod flow;

use crate::flow::Flow;
use crate::node::Node;

fn main() {
    let n1 = Node::EventNode;
    let n2 = Node::FlowNode;
    let n3 = Node::WorkerNode;

    let flow = Flow {
        nodes: vec![n1, n2, n3],
    };

    flow.run();
}
