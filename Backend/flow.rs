use crate::node::Node;

pub struct Flow {
    pub nodes: Vec<Node>,
}

impl Flow {
    pub fn run(&self) {
        println!("Flow hat {} Node(s).", self.nodes.len());
        for node in &self.nodes {
            node.run();
        }
    }
}
