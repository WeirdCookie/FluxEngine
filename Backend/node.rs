
impl Node {
    pub fn run(&self) {
        match self {
            Node::EventNode => println!("Running Event Node"),
            Node::FlowNode => println!("Running Flow Node"),
            Node::WorkerNode => println!("Running Worker Node"),
            Node::IfElseNode => println!("Running If-Else Node"),
        }
    }
}

pub enum Node {
    EventNode,
    FlowNode,
    WorkerNode,
    IfElseNode,
}
